"""
Live queue counts, broadcast over UDP.

QueueTracker  - remembers the status of every active order, built from the
                events that pass through the dispatcher.
QueueTicker   - every few seconds, broadcasts the current counts as one small
                UDP datagram, so any screen on the LAN can show queue length
                without opening a TCP connection.

Watch the ticker:  python -m dispatcher.queue_status
"""
import json
import logging
import socket
import threading

from dispatcher.discovery import BROADCAST_ADDR, SERVICE_NAME, listen

log = logging.getLogger("dispatcher.queue")

QUEUE_PORT = 9003
ACTIVE_STATUSES = ("PLACED", "ACCEPTED", "PREPARING", "READY")


class QueueTracker:
    def __init__(self):
        self._orders = {}            # order_id -> current status, active orders only
        self._lock = threading.Lock()

    def apply(self, event):
        """Update from a dispatcher event. Unknown or malformed events are ignored."""
        if not isinstance(event, dict):
            return
        if event.get("type") not in ("order_created", "order_status_changed"):
            return
        order_id, status = event.get("order_id"), event.get("status")
        if order_id is None or not isinstance(status, str):
            return
        with self._lock:
            if status in ACTIVE_STATUSES:
                self._orders[order_id] = status
            else:                     # COMPLETED / CANCELLED: no longer in the queue
                self._orders.pop(order_id, None)

    def counts(self):
        with self._lock:
            statuses = list(self._orders.values())
        return {s: statuses.count(s) for s in ACTIVE_STATUSES}


def build_queue_message(counts):
    return {
        "service": SERVICE_NAME,
        "type": "queue_status",
        "counts": counts,
        "total_active": sum(counts.values()),
    }


class QueueTicker:
    def __init__(self, tracker, target=(BROADCAST_ADDR, QUEUE_PORT), interval=2.0):
        self.tracker = tracker
        self.target = target
        self.interval = interval
        self._stop = threading.Event()

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def stop(self):
        self._stop.set()

    def _run(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            while True:
                data = json.dumps(build_queue_message(self.tracker.counts())).encode("utf-8")
                try:
                    sock.sendto(data, self.target)
                except OSError as exc:
                    log.warning("could not send queue status: %s", exc)
                if self._stop.wait(self.interval):
                    break
        finally:
            sock.close()


def main():
    print(f"listening for queue status on UDP {QUEUE_PORT} (Ctrl+C to stop)", flush=True)
    try:
        listen(port=QUEUE_PORT,
               on_announcement=lambda addr, msg: print(
                   f"from {addr[0]}: {json.dumps(msg['counts'])}  active={msg['total_active']}",
                   flush=True))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
