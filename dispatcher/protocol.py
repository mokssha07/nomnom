"""
Wire protocol for the canteen dispatcher.

TCP is a byte stream: it has no message boundaries. One send() can arrive as
several recv() chunks, and several send()s can arrive glued into one chunk.
To fix that, every message is framed as:

    [ 4-byte big-endian length N ][ N bytes of UTF-8 JSON ]

The receiver reads exactly 4 bytes, learns N, then reads exactly N bytes.
"""
import json
import struct

HEADER = struct.Struct("!I")          # network byte order, unsigned 32-bit
MAX_MESSAGE_SIZE = 1024 * 1024        # 1 MiB guard against garbage/hostile lengths


class ProtocolError(Exception):
    """The peer sent something that isn't a valid frame."""


class ConnectionClosed(ProtocolError):
    """The peer closed the connection (cleanly or mid-message)."""


def encode_message(payload: dict) -> bytes:
    if not isinstance(payload, dict):
        raise TypeError("payload must be a dict")
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_MESSAGE_SIZE:
        raise ProtocolError(f"message too large: {len(body)} bytes")
    return HEADER.pack(len(body)) + body


def recv_exact(sock, n: int) -> bytes:
    """Read exactly n bytes, looping because recv() may return fewer."""
    chunks = []
    remaining = n
    while remaining > 0:
        chunk = sock.recv(remaining)
        if not chunk:
            raise ConnectionClosed(
                f"connection closed with {remaining} of {n} bytes still expected"
            )
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def send_message(sock, payload: dict) -> None:
    sock.sendall(encode_message(payload))


def recv_message(sock) -> dict:
    (length,) = HEADER.unpack(recv_exact(sock, HEADER.size))
    if length > MAX_MESSAGE_SIZE:
        raise ProtocolError(f"declared length {length} exceeds limit")
    body = recv_exact(sock, length)
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError(f"invalid JSON body: {exc}") from exc
    if not isinstance(payload, dict):
        raise ProtocolError("message body must be a JSON object")
    return payload
