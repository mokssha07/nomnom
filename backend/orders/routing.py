from django.urls import path

from .consumers import KitchenConsumer

websocket_urlpatterns = [
    path("ws/kitchen/", KitchenConsumer.as_asgi()),
]
