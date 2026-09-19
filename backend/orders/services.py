from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .models import Order, OrderItem, OrderStatusLog
from menu.models import MenuItem


class InsufficientStockError(Exception):
    def __init__(self, item_id, item_name, message):
        self.item_id = item_id
        self.item_name = item_name
        self.message = message
        super().__init__(message)


class InvalidTransitionError(Exception):
    pass


ALLOWED_TRANSITIONS = {
    "PLACED": ["ACCEPTED", "CANCELLED"],
    "ACCEPTED": ["PREPARING", "CANCELLED"],
    "PREPARING": ["READY"],
    "READY": ["COMPLETED"],
}


@transaction.atomic
def place_order(user, counter, items, idempotency_key):
    """
    items: list like [{"menu_item_id": 7, "quantity": 2}, ...]

    Why select_for_update(): without locking each MenuItem row while checking and
    decrementing stock, two requests placed at the exact same moment could both read
    stock=1, both pass the "is there enough?" check, and both decrement — leaving
    stock at -1 and two students both thinking they got the last plate. Locking the
    row means the second request has to wait for the first to finish before it can
    even read the stock, so it correctly sees the updated number and fails cleanly.
    """
    existing = Order.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    order = Order.objects.create(
        order_number="TEMP",
        student=user,
        counter=counter,
        status="PLACED",
        total_amount=Decimal("0.00"),
        idempotency_key=idempotency_key,
    )

    total = Decimal("0.00")

    for item in items:
        menu_item = MenuItem.objects.select_for_update().get(id=item["menu_item_id"])

        if not menu_item.is_orderable():
            raise InsufficientStockError(
                menu_item.id, menu_item.name,
                f"'{menu_item.name}' is not available right now."
            )

        quantity = item["quantity"]

        if menu_item.stock_quantity is not None:
            if menu_item.stock_quantity < quantity:
                raise InsufficientStockError(
                    menu_item.id, menu_item.name,
                    f"Only {menu_item.stock_quantity} unit(s) of '{menu_item.name}' left."
                )
            menu_item.stock_quantity -= quantity
            menu_item.save()

        OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=quantity,
            unit_price_at_order=menu_item.price,
        )
        total += menu_item.price * quantity

    order.total_amount = total
    order.order_number = f"ORD-{timezone.now().year}-{order.id:04d}"
    order.save()

    OrderStatusLog.objects.create(order=order, status="PLACED", changed_by=user)

    return order


@transaction.atomic
def update_order_status(order_id, new_status, changed_by):
    order = Order.objects.select_for_update().get(id=order_id)

    allowed = ALLOWED_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise InvalidTransitionError(f"Cannot move from {order.status} to {new_status}.")

    if new_status == "CANCELLED":
        for oi in order.items.select_related("menu_item"):
            mi = MenuItem.objects.select_for_update().get(id=oi.menu_item_id)
            if mi.stock_quantity is not None:
                mi.stock_quantity += oi.quantity
                mi.save()

    order.status = new_status
    order.save()
    OrderStatusLog.objects.create(order=order, status=new_status, changed_by=changed_by)
    return order


@transaction.atomic
def cancel_order(order_id, user):
    order = Order.objects.select_for_update().get(id=order_id)
    if order.student_id != user.id:
        raise PermissionError("You can only cancel your own order.")
    if order.status != "PLACED":
        raise InvalidTransitionError("Order can only be cancelled while it's still Placed.")
    return update_order_status(order_id, "CANCELLED", user)