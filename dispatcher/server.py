"""
Canteen dispatcher: a standalone TCP server with two ports.

  ingest port    - publishers (Django) connect and send framed JSON events
  broadcast port - subscribers (kitchen displays) connect and receive every event

Run:  python -m dispatcher.server
"""
import logging
import socket
import threading

from dispatcher.discovery import Announcer
from dispatcher.queue_status import QueueTicker, QueueTracker
from dispatcher.protocol import (
    ProtocolError, encode_message, recv_message,
)

log = logging.getLogger("dispatcher")

HOST = "0.0.0.0"
# Only Django publishes, and it runs on this machine. The ingest port has no
# authentication, so it listens on loopback only: nobody on the Wi-Fi can inject
# fake orders. The broadcast port stays on HOST so kitchen displays can listen.
# ponytail: if Django ever runs on another machine, this needs a shared secret.
INGEST_HOST = "127.0.0.1"
INGEST_PORT = 9000
BROADCAST_PORT = 9001
SOCKET_TIMEOUT = 5  # seconds; a subscriber that can't accept data this long is dropped


class Dispatcher:
    def __init__(self, host=HOST, ingest_port=INGEST_PORT, broadcast_port=BROADCAST_PORT):
        self.host = host
        self.ingest_port = ingest_port
        self.broadcast_port = broadcast_port
        self._subscribers = set()
        self._subs_lock = threading.Lock()
        self._send_lock = threading.Lock()   # stops two publishers interleaving frames
        self._stop = threading.Event()
        self._listeners = []
        self.tracker = QueueTracker()

    # ---------- lifecycle ----------

    def start(self):
        ingest = self._listen(INGEST_HOST, self.ingest_port)
        broadcast = self._listen(self.host, self.broadcast_port)
        # If port 0 was requested, record the port the OS actually gave us.
        self.ingest_port = ingest.getsockname()[1]
        self.broadcast_port = broadcast.getsockname()[1]
        self._listeners = [ingest, broadcast]
        self._spawn(self._accept_loop, ingest, self._handle_publisher)
        self._spawn(self._accept_loop, broadcast, self._handle_subscriber)
        log.info("ingest on %s:%d, broadcast on %s:%d",
                 INGEST_HOST, self.ingest_port, self.host, self.broadcast_port)

    def stop(self):
        self._stop.set()
        for s in self._listeners:
            try:
                s.close()
            except OSError:
                pass
        with self._subs_lock:
            subs, self._subscribers = list(self._subscribers), set()
        for conn in subs:
            self._close(conn)

    def subscriber_count(self):
        with self._subs_lock:
            return len(self._subscribers)

    # ---------- internals ----------

    def _listen(self, host, port):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((host, port))
        s.listen()
        return s

    @staticmethod
    def _spawn(target, *args):
        threading.Thread(target=target, args=args, daemon=True).start()

    @staticmethod
    def _close(conn):
        try:
            conn.close()
        except OSError:
            pass

    def _accept_loop(self, listener, handler):
        while not self._stop.is_set():
            try:
                conn, addr = listener.accept()
            except OSError:
                break  # listener closed by stop()
            conn.settimeout(SOCKET_TIMEOUT)
            self._spawn(handler, conn, addr)

    def _handle_publisher(self, conn, addr):
        log.info("publisher connected: %s", addr)
        try:
            while True:
                try:
                    event = recv_message(conn)
                except TimeoutError:
                    continue  # idle publisher is fine
                log.info("event from %s: %s", addr, event)
                self.tracker.apply(event)
                self.broadcast(event)
        except (ProtocolError, OSError) as exc:
            log.info("publisher %s gone: %s", addr, exc)
        finally:
            self._close(conn)

    def _handle_subscriber(self, conn, addr):
        log.info("subscriber connected: %s", addr)
        with self._subs_lock:
            self._subscribers.add(conn)
        try:
            # Subscribers never send anything. We only read so that we notice
            # when they disconnect (recv returns b"").
            while True:
                try:
                    if conn.recv(1024) == b"":
                        break
                except TimeoutError:
                    continue
        except OSError:
            pass
        finally:
            with self._subs_lock:
                self._subscribers.discard(conn)
            self._close(conn)
            log.info("subscriber gone: %s", addr)

    def broadcast(self, event):
        frame = encode_message(event)
        with self._subs_lock:
            targets = list(self._subscribers)
        dead = []
        with self._send_lock:
            for conn in targets:
                try:
                    conn.sendall(frame)
                except OSError:
                    dead.append(conn)
        if dead:
            with self._subs_lock:
                for conn in dead:
                    self._subscribers.discard(conn)
            for conn in dead:
                self._close(conn)


def main():
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    d = Dispatcher()
    d.start()
    announcer = Announcer(d.ingest_port, d.broadcast_port)
    announcer.start()
    ticker = QueueTicker(d.tracker)
    ticker.start()
    try:
        threading.Event().wait()   # run until Ctrl+C
    except KeyboardInterrupt:
        log.info("shutting down")
    finally:
        ticker.stop()
        announcer.stop()
        d.stop()


if __name__ == "__main__":
    main()
