from django.core.mail import send_mail
from django.conf import settings
from .async_email import send_async


# Which status changes email the student. PLACED gets its own confirmation;
# ACCEPTED/PREPARING happen seconds apart and would just be inbox noise.
STUDENT_EMAIL_STATUSES = {"READY"}   # add "CANCELLED" to email cancellations too

STATUS_MESSAGES = {
    "READY": ("is ready!", "Please collect it at {counter} and pay at the counter."),
    "CANCELLED": ("was cancelled", "Nothing to pay. You can place a new order any time."),
}


def send_order_confirmation(order):
    """
    Called after an order is successfully placed. Sent through send_async so a
    slow or broken mail server can never delay or fail the checkout request.
    """
    if not order.student.email:
        return   # email is optional at sign-up; the app itself still shows the status
    subject = f"Order Confirmed - {order.order_number}"

    lines = [f"Hi {order.student.username},", "", f"Your order {order.order_number} has been placed.", ""]
    for item in order.items.all():
        lines.append(f"  {item.quantity} x {item.menu_item.name} - Rs {item.unit_price_at_order}")
    lines.append("")
    lines.append(f"Total: Rs {order.total_amount}")
    lines.append(f"Status: {order.status}")

    message = "\n".join(lines)

    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [order.student.email],
        fail_silently=False,
    )


def send_order_confirmation_async(order):
    send_async(send_order_confirmation, order)


def send_order_status(order):
    if not order.student.email or order.status not in STATUS_MESSAGES:
        return
    headline, advice = STATUS_MESSAGES[order.status]
    send_mail(
        f"Order {order.order_number} {headline}",
        "\n".join([
            f"Hi {order.student.username},",
            "",
            f"Your order {order.order_number} {headline}",
            advice.format(counter=order.counter.name),
            "",
            f"Total: Rs {order.total_amount}",
        ]),
        settings.DEFAULT_FROM_EMAIL,
        [order.student.email],
        fail_silently=False,
    )


def send_order_status_async(order):
    send_async(send_order_status, order)



def send_low_stock_alert(menu_item):
    subject = f"Low Stock Alert - {menu_item.name}"
    message = (
        f"'{menu_item.name}' at {menu_item.counter.name} is running low.\n\n"
        f"Current stock: {menu_item.stock_quantity}\n"
        f"Threshold: {menu_item.low_stock_threshold}\n\n"
        f"Please restock soon."
    )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [settings.MANAGER_EMAIL],
        fail_silently=False,
    )


def send_low_stock_alert_async(menu_item):
    send_async(send_low_stock_alert, menu_item)

from django.core.mail import EmailMessage


def send_daily_report(day, order_count, line_count, revenue, csv_path):
    subject = f"Daily Sales Report - {day}"
    body = (
        f"Sales summary for {day}\n\n"
        f"Total orders: {order_count}\n"
        f"Total line items: {line_count}\n"
        f"Completed revenue: Rs {revenue:.2f}\n\n"
        f"Full breakdown attached as CSV."
    )
    email = EmailMessage(
        subject,
        body,
        settings.DEFAULT_FROM_EMAIL,
        [settings.MANAGER_EMAIL],
    )
    email.attach_file(str(csv_path))
    email.send(fail_silently=False)


def send_daily_report_async(day, order_count, line_count, revenue, csv_path):
    send_async(send_daily_report, day, order_count, line_count, revenue, csv_path)