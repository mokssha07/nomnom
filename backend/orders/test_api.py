from asgiref.sync import async_to_sync
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from canteen_system.asgi import application
from counters.models import Counter
from menu.models import Category, MenuItem
from orders.models import Order

User = get_user_model()


class PlaceOrderValidationTest(TransactionTestCase):
    def setUp(self):
        self.counter = Counter.objects.create(name="Main Kitchen", slug="main")
        self.other_counter = Counter.objects.create(name="Juice Bar", slug="juice")
        cat = Category.objects.create(name="Snacks")
        self.item = MenuItem.objects.create(
            name="Samosa", price=10, category=cat, counter=self.counter, stock_quantity=5
        )
        self.juice = MenuItem.objects.create(
            name="Lime Soda", price=30, category=cat, counter=self.other_counter
        )
        self.student = User.objects.create_user(username="s1", password="pass12345")
        self.client = APIClient()
        self.client.force_authenticate(self.student)

    def order(self, items, key="k1", counter=None, user=None):
        if user:
            self.client.force_authenticate(user)
        return self.client.post("/api/orders/", {
            "counter_id": (counter or self.counter).id, "items": items, "idempotency_key": key,
        }, format="json")

    def test_rejects_zero_negative_and_non_numeric_quantity(self):
        for bad in (0, -5, "two", None):
            r = self.order([{"menu_item_id": self.item.id, "quantity": bad}], key=f"k{bad}")
            self.assertEqual(r.status_code, 400, bad)
            self.assertEqual(r.data["error"], "invalid_request")
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock_quantity, 5)   # negative qty used to ADD stock
        self.assertEqual(Order.objects.count(), 0)

    def test_rejects_missing_key_and_empty_items(self):
        r = self.client.post("/api/orders/", {"counter_id": self.counter.id, "items": [
            {"menu_item_id": self.item.id, "quantity": 1}]}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.order([]).status_code, 400)

    def test_rejects_item_from_another_counter(self):
        r = self.order([{"menu_item_id": self.juice.id, "quantity": 1}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"], "invalid_order")
        self.assertEqual(Order.objects.count(), 0)

    def test_rejects_unavailable_item(self):
        self.item.is_available = False
        self.item.save()
        r = self.order([{"menu_item_id": self.item.id, "quantity": 1}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data["error"], "insufficient_stock")

    def test_same_key_returns_same_order_but_not_to_another_student(self):
        first = self.order([{"menu_item_id": self.item.id, "quantity": 1}])
        again = self.order([{"menu_item_id": self.item.id, "quantity": 1}])
        self.assertEqual(first.status_code, 201)
        self.assertEqual(again.data["id"], first.data["id"])

        thief = User.objects.create_user(username="s2", password="pass12345")
        stolen = self.order([{"menu_item_id": self.item.id, "quantity": 1}], user=thief)
        self.assertEqual(stolen.status_code, 400)
        self.assertNotIn("order_number", stolen.data)

    def test_missing_order_is_404_not_500(self):
        staff = User.objects.create_user(username="cook", password="pass12345", role="staff")
        self.assertEqual(self.client.delete("/api/orders/999/").status_code, 404)
        self.client.force_authenticate(staff)
        r = self.client.patch("/api/orders/999/status/", {"status": "ACCEPTED"}, format="json")
        self.assertEqual(r.status_code, 404)


class KitchenSocketAuthTest(TransactionTestCase):
    def connects(self, query=""):
        async def attempt():
            comm = WebsocketCommunicator(application, f"/ws/kitchen/{query}")
            connected, _ = await comm.connect()
            await comm.disconnect()
            return connected
        return async_to_sync(attempt)()

    def test_only_staff_tokens_get_the_feed(self):
        student = User.objects.create_user(username="s1", password="pass12345")
        staff = User.objects.create_user(username="cook", password="pass12345", role="staff")
        self.assertFalse(self.connects())
        self.assertFalse(self.connects("?token=nonsense"))
        self.assertFalse(self.connects(f"?token={Token.objects.create(user=student).key}"))
        self.assertTrue(self.connects(f"?token={Token.objects.create(user=staff).key}"))


class OrderRateLimitTest(TransactionTestCase):
    def test_placing_orders_is_capped_per_student_but_listing_is_not(self):
        from django.core.cache import cache
        cache.clear()
        counter = Counter.objects.create(name="Main Kitchen", slug="main")
        item = MenuItem.objects.create(name="Chai", price=15, counter=counter,
                                       category=Category.objects.create(name="Drinks"))
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username="s1", password="pass12345"))
        codes = [client.post("/api/orders/", {"counter_id": counter.id, "idempotency_key": f"k{i}",
                                              "items": [{"menu_item_id": item.id, "quantity": 1}]},
                             format="json").status_code for i in range(31)]
        self.assertEqual(codes[:30], [201] * 30)
        self.assertEqual(codes[30], 429)
        self.assertEqual(client.get("/api/orders/").status_code, 200)
