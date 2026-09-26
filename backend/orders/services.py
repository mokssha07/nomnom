from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .events import order_created_event, order_status_event, publish_event
from .models import Order, OrderItem, OrderStatusLog
from menu.models import MenuItem
from django.db import transaction as db_transaction
from notifications.emails import (
    STUDENT_EMAIL_STATUSES, send_low_stock_alert_async, send_order_confirmation_async,
    send_order_status_async,
)


class InsufficientStockError(Exception):
    def __init__(self, item_id, item_name, message):
        self.item_id = item_id
        self.item_name = item_name
        self.message = message
        super().__init__(message)


class InvalidTransitionError(Exception):
    pass


class InvalidOrderError(Exception):
    """The request is well-formed but can't be turned into an order."""


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
        if existing.student_id != user.id:
            # Never hand one student's order back to another.
            raise InvalidOrderError("This idempotency_key has already been used.")
        return existing

    if not counter.is_active:
        raise InvalidOrderError(f"'{counter.name}' is not taking orders right now.")

    order = Order.objects.create(
        order_number="TEMP",
        student=user,
        counter=counter,
        status="PLACED",
        total_amount=Decimal("0.00"),
        idempotency_key=idempotency_key,
    )

    total = Decimal("0.00")
    event_items = []

    for item in items:
        try:
            menu_item = MenuItem.objects.select_for_update().get(id=item["menu_item_id"])
        except MenuItem.DoesNotExist:
            raise InsufficientStockError(
                item["menu_item_id"], None,
                f"Menu item with id {item['menu_item_id']} does not exist."
            )

        if menu_item.counter_id != counter.id:
            raise InvalidOrderError(
                f"'{menu_item.name}' is not sold at '{counter.name}'. One order = one counter."
            )
        if not menu_item.is_available:
            raise InsufficientStockError(
                menu_item.id, menu_item.name, f"'{menu_item.name}' is not available right now."
            )

        quantity = item["quantity"]

        if menu_item.stock_quantity is not None:
            if menu_item.stock_quantity < quantity:
                raise InsufficientStockError(
                    menu_item.id, menu_item.name,
                    f"Only {menu_item.stock_quantity} unit(s) of '{menu_item.name}' left."
                )
            menu_item.stock_quantity -= quantity

            if (menu_item.stock_quantity <= menu_item.low_stock_threshold
                    and menu_item.low_stock_alert_sent_at is None):
                menu_item.low_stock_alert_sent_at = timezone.now()
                transaction.on_commit(lambda mi=menu_item: send_low_stock_alert_async(mi))

            menu_item.save()

        OrderItem.objects.create(
            order=order,
            menu_item=menu_item,
            quantity=quantity,
            unit_price_at_order=menu_item.price,
        )
        total += menu_item.price * quantity
        event_items.append(
            {"menu_item_id": menu_item.id, "name": menu_item.name, "quantity": quantity}
        )

    order.total_amount = total
    order.order_number = f"ORD-{timezone.now().year}-{order.id:04d}"
    order.save()

    OrderStatusLog.objects.create(order=order, status="PLACED", changed_by=user)

    # Publish only after the database commit succeeds. If this transaction rolls
    # back (e.g. InsufficientStockError), the callback is discarded and nothing is sent.
    event = order_created_event(order, event_items)
    transaction.on_commit(lambda: publish_event(event))

    transaction.on_commit(lambda: send_order_confirmation_async(order))

    return order


@transaction.atomic
def update_order_status(order_id, new_status, changed_by):
    order = Order.objects.select_for_update().get(id=order_id)

    allowed = ALLOWED_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        raise InvalidTransitionError(f"Cannot move from {order.status} to {new_status}.")

    previous_status = order.status

    if new_status == "CANCELLED":
        for oi in order.items.select_related("menu_item"):
            mi = MenuItem.objects.select_for_update().get(id=oi.menu_item_id)
            if mi.stock_quantity is not None:
                mi.stock_quantity += oi.quantity
                mi.save()

    order.status = new_status
    order.save()
    OrderStatusLog.objects.create(order=order, status=new_status, changed_by=changed_by)

    event = order_status_event(order, previous_status)
    transaction.on_commit(lambda: publish_event(event))
    if new_status in STUDENT_EMAIL_STATUSES:
        transaction.on_commit(lambda: send_order_status_async(order))

    return order


@transaction.atomic
def cancel_order(order_id, user):
    order = Order.objects.select_for_update().get(id=order_id)
    if order.student_id != user.id:
        raise PermissionError("You can only cancel your own order.")
    if order.status != "PLACED":
        raise InvalidTransitionError("Order can only be cancelled while it's still Placed.")
    return update_order_status(order_id, "CANCELLED", user)
