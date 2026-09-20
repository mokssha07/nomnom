from django.core import mail
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from counters.models import Counter
from menu.models import Category, MenuItem
from orders.services import place_order

User = get_user_model()


class OrderEmailTest(TransactionTestCase):
    """
    Uses Django's in-memory email backend (set automatically during tests),
    so these run fast and never need MailPit or a real SMTP connection.
    Sent emails land in mail.outbox instead of actually going anywhere.
    """

    def setUp(self):
        self.counter = Counter.objects.create(name="Main Kitchen", slug="main-kitchen")
        self.category = Category.objects.create(name="Snacks")
        self.student = User.objects.create_user(
            username="student1", password="pass12345", email="student1@test.com"
        )

    def test_placing_order_queues_one_confirmation_email(self):
        item = MenuItem.objects.create(
            name="Samosa", price=25, category=self.category,
            counter=self.counter, stock_quantity=10, low_stock_threshold=5,
        )
        place_order(self.student, self.counter, [{"menu_item_id": item.id, "quantity": 1}], "key1")

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Order Confirmed", mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ["student1@test.com"])

    def test_stock_dip_below_threshold_sends_one_alert(self):
        item = MenuItem.objects.create(
            name="Samosa", price=25, category=self.category,
            counter=self.counter, stock_quantity=6, low_stock_threshold=5,
        )
        place_order(self.student, self.counter, [{"menu_item_id": item.id, "quantity": 2}], "key1")

        subjects = [m.subject for m in mail.outbox]
        self.assertTrue(any("Low Stock Alert" in s for s in subjects))
        alert_count = sum(1 for s in subjects if "Low Stock Alert" in s)
        self.assertEqual(alert_count, 1)

    def test_second_dip_without_restock_does_not_alert_again(self):
        item = MenuItem.objects.create(
            name="Samosa", price=25, category=self.category,
            counter=self.counter, stock_quantity=6, low_stock_threshold=5,
        )
        place_order(self.student, self.counter, [{"menu_item_id": item.id, "quantity": 2}], "key1")
        place_order(self.student, self.counter, [{"menu_item_id": item.id, "quantity": 1}], "key2")

        subjects = [m.subject for m in mail.outbox]
        alert_count = sum(1 for s in subjects if "Low Stock Alert" in s)
        self.assertEqual(alert_count, 1)

    def test_healthy_stock_order_sends_no_alert(self):
        item = MenuItem.objects.create(
            name="Samosa", price=25, category=self.category,
            counter=self.counter, stock_quantity=100, low_stock_threshold=5,
        )
        place_order(self.student, self.counter, [{"menu_item_id": item.id, "quantity": 1}], "key1")

        subjects = [m.subject for m in mail.outbox]
        self.assertFalse(any("Low Stock Alert" in s for s in subjects))
