"""
Command-line test client for the dispatcher.

  Terminal A:  python -m dispatcher.client subscribe
  Terminal B:  python -m dispatcher.client publish '{"type":"order_created","order_id":1}'
"""
import argparse
import json
import socket
import sys
import time

from dispatcher.protocol import ProtocolError, recv_message, send_message

DEFAULT_HOST = "127.0.0.1"


def subscribe(host, port):
    """Act like a kitchen display: print every event; reconnect if the server drops."""
    while True:
        try:
            with socket.create_connection((host, port), timeout=5) as sock:
                sock.settimeout(None)   # block forever waiting for events
                print(f"connected to {host}:{port}", flush=True)
                while True:
                    print(json.dumps(recv_message(sock)), flush=True)
        except (ProtocolError, OSError) as exc:
            print(f"disconnected ({exc}); retrying in 1s", flush=True)
            time.sleep(1)


def publish(host, port, raw_json):
    """Act like Django: send one event and exit."""
    try:
        event = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        sys.exit(f"invalid JSON: {exc}")
    if not isinstance(event, dict):
        sys.exit("event must be a JSON object, e.g. '{\"type\":\"order_created\"}'")
    try:
        with socket.create_connection((host, port), timeout=5) as sock:
            send_message(sock, event)
    except OSError as exc:
        sys.exit(f"could not publish to {host}:{port}: {exc}")
    print(f"published to {host}:{port}: {json.dumps(event)}")


def main():
    parser = argparse.ArgumentParser(prog="dispatcher.client")
    parser.add_argument("--host", default=DEFAULT_HOST)
    sub = parser.add_subparsers(dest="command", required=True)

    p_sub = sub.add_parser("subscribe", help="print events as they arrive")
    p_sub.add_argument("--port", type=int, default=9001)

    p_pub = sub.add_parser("publish", help="send one event")
    p_pub.add_argument("event", help="JSON object, e.g. '{\"type\":\"order_created\"}'")
    p_pub.add_argument("--port", type=int, default=9000)

    args = parser.parse_args()
    try:
        if args.command == "subscribe":
            subscribe(args.host, args.port)
        else:
            publish(args.host, args.port, args.event)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
