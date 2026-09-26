from rest_framework import serializers
from .models import Order, OrderItem, OrderStatusLog


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item = serializers.CharField(source='menu_item.name', read_only=True)
    unit_price = serializers.DecimalField(source='unit_price_at_order', max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ['menu_item', 'quantity', 'unit_price']


class OrderStatusLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderStatusLog
        fields = ['status', 'timestamp']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    status_log = OrderStatusLogSerializer(many=True, read_only=True)
    counter = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'order_number', 'status', 'counter', 'total_amount', 'items', 'status_log', 'created_at']

    def get_counter(self, obj):
        return {"id": obj.counter.id, "name": obj.counter.name}

class PlaceOrderItemSerializer(serializers.Serializer):
    menu_item_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=50)


class PlaceOrderSerializer(serializers.Serializer):
    """Validates the POST /api/orders/ body before it reaches place_order()."""
    counter_id = serializers.IntegerField(min_value=1)
    items = PlaceOrderItemSerializer(many=True, allow_empty=False, max_length=50)
    idempotency_key = serializers.CharField(max_length=100)
