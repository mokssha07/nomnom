import json
import socket
import time
import unittest

from dispatcher.protocol import send_message
from dispatcher.queue_status import QueueTicker, QueueTracker
from dispatcher.server import Dispatcher


def wait_for(condition, timeout=3):
    end = time.time() + timeout
    while time.time() < end:
        if condition():
            return True
        time.sleep(0.01)
    return False


def created(oid):
    return {"type": "order_created", "order_id": oid, "status": "PLACED"}


def changed(oid, status):
    return {"type": "order_status_changed", "order_id": oid, "status": status}


class TrackerTests(unittest.TestCase):
    def test_full_lifecycle(self):
        t = QueueTracker()
        t.apply(created(1))
        self.assertEqual(t.counts()["PLACED"], 1)
        for status in ("ACCEPTED", "PREPARING", "READY"):
            t.apply(changed(1, status))
            self.assertEqual(t.counts()[status], 1)
            self.assertEqual(sum(t.counts().values()), 1)   # moved, not duplicated
        t.apply(changed(1, "COMPLETED"))
        self.assertEqual(sum(t.counts().values()), 0)

    def test_cancelled_leaves_the_queue(self):
        t = QueueTracker()
        t.apply(created(1))
        t.apply(changed(1, "CANCELLED"))
        self.assertEqual(sum(t.counts().values()), 0)

    def test_multiple_orders_counted_separately(self):
        t = QueueTracker()
        for i in (1, 2, 3):
            t.apply(created(i))
        t.apply(changed(2, "PREPARING"))
        self.assertEqual(t.counts(), {"PLACED": 2, "ACCEPTED": 0, "PREPARING": 1, "READY": 0})

    def test_garbage_is_ignored(self):
        t = QueueTracker()
        for junk in ("text", None, {}, {"type": "other"}, {"type": "order_created"},
                     {"type": "order_created", "order_id": 1, "status": 5}):
            t.apply(junk)
        self.assertEqual(sum(t.counts().values()), 0)


class TickerTests(unittest.TestCase):
    def test_datagram_carries_current_counts(self):
        rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        rx.bind(("127.0.0.1", 0))
        rx.settimeout(3)
        tracker = QueueTracker()
        tracker.apply(created(1))
        tracker.apply(created(2))
        ticker = QueueTicker(tracker, target=("127.0.0.1", rx.getsockname()[1]), interval=0.05)
        ticker.start()
        try:
            data, _ = rx.recvfrom(4096)
        finally:
            ticker.stop()
            rx.close()
        msg = json.loads(data)
        self.assertEqual(msg["type"], "queue_status")
        self.assertEqual(msg["counts"]["PLACED"], 2)
        self.assertEqual(msg["total_active"], 2)


class DispatcherIntegrationTests(unittest.TestCase):
    def test_dispatcher_updates_tracker_from_published_events(self):
        d = Dispatcher(host="127.0.0.1", ingest_port=0, broadcast_port=0)
        d.start()
        pub = socket.create_connection(("127.0.0.1", d.ingest_port), timeout=3)
        try:
            send_message(pub, created(1))
            send_message(pub, changed(1, "ACCEPTED"))
            self.assertTrue(wait_for(lambda: d.tracker.counts()["ACCEPTED"] == 1))
            self.assertEqual(d.tracker.counts()["PLACED"], 0)
        finally:
            pub.close()
            d.stop()


if __name__ == "__main__":
    unittest.main()
