from channels.generic.websocket import AsyncJsonWebsocketConsumer

from .bridge import KITCHEN_GROUP, ensure_bridge_running


class KitchenConsumer(AsyncJsonWebsocketConsumer):
    """One browser kitchen display = one WebSocket connection to this consumer."""

    async def connect(self):
        ensure_bridge_running()
        await self.channel_layer.group_add(KITCHEN_GROUP, self.channel_name)
        await self.accept()
        await self.send_json({"type": "hello", "message": "connected to kitchen feed"})

    async def disconnect(self, code):
        await self.channel_layer.group_discard(KITCHEN_GROUP, self.channel_name)

    async def kitchen_event(self, message):
        # The bridge does group_send(KITCHEN_GROUP, {"type": "kitchen.event", "event": {...}})
        await self.send_json(message["event"])
