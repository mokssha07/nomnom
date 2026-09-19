import socket
import struct
import threading
import time
import unittest

from dispatcher.protocol import (
    HEADER, MAX_MESSAGE_SIZE, ConnectionClosed, ProtocolError,
    encode_message, recv_message, send_message,
)


class FramingTests(unittest.TestCase):
    def setUp(self):
        self.a, self.b = socket.socketpair()
        self.a.settimeout(3)
        self.b.settimeout(3)

    def tearDown(self):
        self.a.close()
        self.b.close()

    def test_round_trip(self):
        msg = {"type": "order_created", "order_id": 7, "items": ["samosa"]}
        send_message(self.a, msg)
        self.assertEqual(recv_message(self.b), msg)

    def test_coalesced_messages_are_split_correctly(self):
        # Three messages in ONE send: TCP may deliver them glued together.
        blob = b"".join(encode_message({"n": i}) for i in range(3))
        self.a.sendall(blob)
        self.assertEqual([recv_message(self.b)["n"] for _ in range(3)], [0, 1, 2])

    def test_fragmented_message_is_reassembled(self):
        # One message dribbled out a byte at a time.
        frame = encode_message({"type": "status_changed", "status": "ready"})

        def dribble():
            for i in range(len(frame)):
                self.a.sendall(frame[i:i + 1])
                time.sleep(0.001)

        t = threading.Thread(target=dribble)
        t.start()
        self.assertEqual(recv_message(self.b)["status"], "ready")
        t.join()

    def test_unicode_survives(self):
        send_message(self.a, {"note": "extra chutney \u2013 \u0938\u092e\u094b\u0938\u093e"})
        self.assertIn("\u0938\u092e\u094b\u0938\u093e", recv_message(self.b)["note"])

    def test_clean_close_raises_connection_closed(self):
        self.a.close()
        with self.assertRaises(ConnectionClosed):
            recv_message(self.b)

    def test_close_mid_message_raises_connection_closed(self):
        self.a.sendall(encode_message({"x": 1})[:-2])   # truncated frame
        self.a.close()
        with self.assertRaises(ConnectionClosed):
            recv_message(self.b)

    def test_oversized_declared_length_rejected(self):
        self.a.sendall(HEADER.pack(MAX_MESSAGE_SIZE + 1))
        with self.assertRaises(ProtocolError):
            recv_message(self.b)

    def test_invalid_json_rejected(self):
        body = b"not json"
        self.a.sendall(struct.pack("!I", len(body)) + body)
        with self.assertRaises(ProtocolError):
            recv_message(self.b)

    def test_non_object_json_rejected(self):
        body = b"[1,2,3]"
        self.a.sendall(struct.pack("!I", len(body)) + body)
        with self.assertRaises(ProtocolError):
            recv_message(self.b)


if __name__ == "__main__":
    unittest.main()
