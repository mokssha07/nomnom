"""
UDP discovery for the canteen dispatcher.

The dispatcher broadcasts a small JSON datagram every few seconds saying
"I'm here, at this IP, on these ports". Kitchen displays on the same LAN can
listen for it instead of hard-coding an address, which matters because DHCP
can hand the laptop a new IP at any time.

UDP is message-oriented (one datagram = one message), so unlike TCP it needs
no length-prefix framing.

Watch announcements:  python -m dispatcher.discovery
"""
import json
import logging
import socket
import threading

log = logging.getLogger("dispatcher.discovery")

DISCOVERY_PORT = 9002
BROADCAST_ADDR = "255.255.255.255"
SERVICE_NAME = "canteen-dispatcher"


def get_lan_ip():
    """The IP this machine uses on its LAN. Sends no packets (UDP connect only picks a route)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def build_announcement(host, ingest_port, broadcast_port):
    return {
        "service": SERVICE_NAME,
        "version": 1,
        "host": host,
        "ingest_port": ingest_port,
        "broadcast_port": broadcast_port,
    }


class Announcer:
    def __init__(self, ingest_port, broadcast_port,
                 target=(BROADCAST_ADDR, DISCOVERY_PORT), interval=2.0, host=None):
        self.ingest_port = ingest_port
        self.broadcast_port = broadcast_port
        self.target = target
        self.interval = interval
        self.host = host              # None = look up the LAN IP on every announcement
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            while True:
                # Looked up every time, so a new DHCP address is announced automatically.
                host = self.host or get_lan_ip()
                data = json.dumps(
                    build_announcement(host, self.ingest_port, self.broadcast_port)
                ).encode("utf-8")
                try:
                    sock.sendto(data, self.target)
                except OSError as exc:   # e.g. Wi-Fi is off: keep trying
                    log.warning("could not announce: %s", exc)
                if self._stop.wait(self.interval):
                    break
        finally:
            sock.close()


def listen(port=DISCOVERY_PORT, on_announcement=print, stop_event=None):
    """Receive announcements. Calls on_announcement(addr, dict) for each valid one."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, "SO_REUSEPORT"):   # lets several listeners share the port on macOS
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    sock.bind(("", port))
    sock.settimeout(0.5)
    try:
        while not (stop_event and stop_event.is_set()):
            try:
                data, addr = sock.recvfrom(4096)
            except socket.timeout:
                continue
            try:
                msg = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if isinstance(msg, dict) and msg.get("service") == SERVICE_NAME:
                on_announcement(addr, msg)
    finally:
        sock.close()


def main():
    print(f"listening for dispatcher announcements on UDP {DISCOVERY_PORT} (Ctrl+C to stop)",
          flush=True)
    try:
        listen(on_announcement=lambda addr, msg: print(f"from {addr[0]}: {json.dumps(msg)}",
                                                       flush=True))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
