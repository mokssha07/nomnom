"""
TCP -> WebSocket bridge.

Browsers can't open raw TCP sockets, so this runs inside the Django (ASGI)
process: it connects to the dispatcher's broadcast port as an ordinary
subscriber, and re-publishes every event to the "kitchen" Channels group,
which pushes it to every connected WebSocket.

It starts on the first WebSocket connection and reconnects by itself if the
dispatcher goes away, so WebSocket clients never notice a dispatcher restart.
"""
import asyncio
import json
import logging
import sys
from pathlib import Path

from channels.layers import get_channel_layer
from django.conf import settings

# The dispatcher package lives next to backend/, so add the project root to sys.path.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from dispatcher.protocol import HEADER, MAX_MESSAGE_SIZE, ProtocolError  # noqa: E402

log = logging.getLogger(__name__)

KITCHEN_GROUP = "kitchen"
RETRY_SECONDS = 1

_task = None


async def read_event(reader):
    """Async twin of dispatcher.protocol.recv_message, using the same framing."""
    (length,) = HEADER.unpack(await reader.readexactly(HEADER.size))
    if length > MAX_MESSAGE_SIZE:
        raise ProtocolError(f"declared length {length} exceeds limit")
    body = await reader.readexactly(length)
    event = json.loads(body.decode("utf-8"))   # bad JSON/UTF-8 raises ValueError
    if not isinstance(event, dict):
        raise ProtocolError("message body must be a JSON object")
    return event


async def run_bridge():
    host = getattr(settings, "DISPATCHER_HOST", "127.0.0.1")
    port = getattr(settings, "DISPATCHER_BROADCAST_PORT", 9001)
    layer = get_channel_layer()
    warned = False
    while True:
        writer = None
        try:
            reader, writer = await asyncio.open_connection(host, port)
            log.info("bridge connected to dispatcher at %s:%s", host, port)
            warned = False
            while True:
                event = await read_event(reader)
                await layer.group_send(
                    KITCHEN_GROUP, {"type": "kitchen.event", "event": event}
                )
        except asyncio.CancelledError:
            raise
        except (OSError, asyncio.IncompleteReadError, ProtocolError, ValueError) as exc:
            if not warned:   # one warning per outage, not one per retry
                log.warning("bridge cannot reach dispatcher at %s:%s (%s); retrying every %ss",
                            host, port, exc, RETRY_SECONDS)
                warned = True
        finally:
            if writer is not None:
                writer.close()
        await asyncio.sleep(RETRY_SECONDS)


def ensure_bridge_running():
    """Start the bridge task if it isn't already running. Call from async code."""
    global _task
    if _task is None or _task.done():
        _task = asyncio.get_running_loop().create_task(run_bridge())
