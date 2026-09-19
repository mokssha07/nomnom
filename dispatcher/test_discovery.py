import ipaddress
import json
import socket
import threading
import unittest

from dispatcher.discovery import (
    SERVICE_NAME, Announcer, build_announcement, get_lan_ip, listen,
)


class DiscoveryTests(unittest.TestCase):
    def test_get_lan_ip_returns_valid_ipv4(self):
        ipaddress.IPv4Address(get_lan_ip())   # raises if invalid

    def test_announcement_contents(self):
        msg = build_announcement("192.168.1.20", 9000, 9001)
        self.assertEqual(msg["service"], SERVICE_NAME)
        self.assertEqual(msg["host"], "192.168.1.20")
        self.assertEqual((msg["ingest_port"], msg["broadcast_port"]), (9000, 9001))

    def test_announcer_datagram_is_received_and_parsed(self):
        rx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        rx.bind(("127.0.0.1", 0))
        rx.settimeout(3)
        port = rx.getsockname()[1]
        a = Announcer(9000, 9001, target=("127.0.0.1", port), interval=0.05, host="10.0.0.5")
        a.start()
        try:
            data, _ = rx.recvfrom(4096)
        finally:
            a.stop()
            rx.close()
        msg = json.loads(data)
        self.assertEqual(msg["host"], "10.0.0.5")
        self.assertEqual(msg["ingest_port"], 9000)

    def test_listen_ignores_junk_and_other_services(self):
        found = []
        stop = threading.Event()
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
        probe.close()
        t = threading.Thread(target=listen, kwargs=dict(
            port=port, on_announcement=lambda addr, m: found.append(m), stop_event=stop))
        t.start()
        tx = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        import time; time.sleep(0.2)
        tx.sendto(b"\xff\xfe junk", ("127.0.0.1", port))
        tx.sendto(json.dumps({"service": "something-else"}).encode(), ("127.0.0.1", port))
        tx.sendto(json.dumps(build_announcement("1.2.3.4", 9000, 9001)).encode(),
                  ("127.0.0.1", port))
        time.sleep(0.4)
        stop.set(); t.join(); tx.close()
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["host"], "1.2.3.4")


if __name__ == "__main__":
    unittest.main()
