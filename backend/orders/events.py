"""
Publishes order events to the dispatcher.

publish_event() never raises: a dead or unreachable dispatcher must not break
order placement. The event is simply dropped and a warning is logged.
"""
import logging
import socket
import sys
from pathlib import Path

from django.conf import settings

# The dispatcher package lives next to backend/, so add the project root to sys.path.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from dispatcher.protocol import encode_message  # noqa: E402

log = logging.getLogger(__name__)


def order_created_event(order, items):
    """items: list of {"menu_item_id", "name", "quantity"} dicts."""
    return {
        "type": "order_created",
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "counter_id": order.counter_id,
        "total_amount": str(order.total_amount),
        "items": items,
    }


def order_status_event(order, previous_status):
    return {
        "type": "order_status_changed",
        "order_id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "previous_status": previous_status,
        "counter_id": order.counter_id,
    }


def publish_event(event):
    host = getattr(settings, "DISPATCHER_HOST", "127.0.0.1")
    port = getattr(settings, "DISPATCHER_INGEST_PORT", 9000)
    timeout = getattr(settings, "DISPATCHER_TIMEOUT", 0.5)
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.sendall(encode_message(event))
    except Exception as exc:  # deliberately broad: never break the caller
        log.warning("dispatcher unavailable, dropped %s event: %s",
                    event.get("type"), exc)
