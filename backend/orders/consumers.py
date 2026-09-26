from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.authtoken.models import Token

from .bridge import KITCHEN_GROUP, ensure_bridge_running


@database_sync_to_async
def is_staff_token(key):
    token = Token.objects.select_related("user").filter(key=key).first()
    return token is not None and token.user.role in ("staff", "manager")


class KitchenConsumer(AsyncJsonWebsocketConsumer):
    """One browser kitchen display = one WebSocket connection to this consumer.

    Browsers can't set headers on a WebSocket, so the DRF token comes in the
    query string: ws/kitchen/?token=<token>. Only staff and managers get in.
    """

    async def connect(self):
        query = parse_qs(self.scope["query_string"].decode())
        key = query.get("token", [""])[0]
        if not key or not await is_staff_token(key):
            await self.close(code=4403)
            return
        ensure_bridge_running()
        await self.channel_layer.group_add(KITCHEN_GROUP, self.channel_name)
        await self.accept()
        await self.send_json({"type": "hello", "message": "connected to kitchen feed"})

    async def disconnect(self, code):
        await self.channel_layer.group_discard(KITCHEN_GROUP, self.channel_name)

    async def kitchen_event(self, message):
        # The bridge does group_send(KITCHEN_GROUP, {"type": "kitchen.event", "event": {...}})
        await self.send_json(message["event"])
