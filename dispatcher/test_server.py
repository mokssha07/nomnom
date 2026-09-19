import socket
import time
import unittest

from dispatcher.protocol import recv_message, send_message
from dispatcher.server import Dispatcher


def wait_for(condition, timeout=3):
    end = time.time() + timeout
    while time.time() < end:
        if condition():
            return True
        time.sleep(0.01)
    return False


class DispatcherTests(unittest.TestCase):
    def setUp(self):
        # Port 0 = let the OS pick free ports, so tests never clash with a real server.
        self.d = Dispatcher(host="127.0.0.1", ingest_port=0, broadcast_port=0)
        self.d.start()
        self.socks = []

    def tearDown(self):
        for s in self.socks:
            s.close()
        self.d.stop()

    def connect(self, port):
        s = socket.create_connection(("127.0.0.1", port), timeout=3)
        self.socks.append(s)
        return s

    def subscriber(self):
        s = self.connect(self.d.broadcast_port)
        wait_for(lambda: self.d.subscriber_count() >= len(
            [x for x in self.socks if x.getpeername()[1] == self.d.broadcast_port]))
        return s

    def publisher(self):
        return self.connect(self.d.ingest_port)

    def test_event_reaches_every_subscriber(self):
        sub1, sub2 = self.subscriber(), self.subscriber()
        send_message(self.publisher(), {"type": "order_created", "order_id": 1})
        self.assertEqual(recv_message(sub1)["order_id"], 1)
        self.assertEqual(recv_message(sub2)["order_id"], 1)

    def test_events_arrive_in_order(self):
        sub = self.subscriber()
        pub = self.publisher()
        for i in range(20):
            send_message(pub, {"n": i})
        self.assertEqual([recv_message(sub)["n"] for _ in range(20)], list(range(20)))

    def test_disconnected_subscriber_does_not_break_others(self):
        gone, alive = self.subscriber(), self.subscriber()
        gone.close()
        wait_for(lambda: self.d.subscriber_count() == 1)
        send_message(self.publisher(), {"n": 1})
        self.assertEqual(recv_message(alive)["n"], 1)

    def test_publisher_disconnect_does_not_kill_server(self):
        sub = self.subscriber()
        p1 = self.publisher()
        send_message(p1, {"n": 1})
        p1.close()
        send_message(self.publisher(), {"n": 2})
        self.assertEqual(recv_message(sub)["n"], 1)
        self.assertEqual(recv_message(sub)["n"], 2)

    def test_garbage_from_publisher_does_not_kill_server(self):
        sub = self.subscriber()
        bad = self.publisher()
        bad.sendall(b"\xff\xff\xff\xffgarbage")
        send_message(self.publisher(), {"n": 9})
        self.assertEqual(recv_message(sub)["n"], 9)


if __name__ == "__main__":
    unittest.main()
