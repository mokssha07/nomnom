import threading
from django.db import connection
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from counters.models import Counter
from menu.models import Category, MenuItem
from orders.services import place_order, InsufficientStockError

User = get_user_model()


class ConcurrentOrderTest(TransactionTestCase):
    def setUp(self):
        self.counter = Counter.objects.create(name="Main Kitchen", slug="main-kitchen")
        self.category = Category.objects.create(name="Snacks")
        self.item = MenuItem.objects.create(
            name="Last Samosa", price=10, category=self.category,
            counter=self.counter, stock_quantity=1
        )
        self.user1 = User.objects.create_user(username="student1", password="pass12345")
        self.user2 = User.objects.create_user(username="student2", password="pass12345")

    def test_only_one_order_succeeds_when_stock_is_one(self):
        results = []

        def try_order(user, key):
            try:
                place_order(user, self.counter, [{"menu_item_id": self.item.id, "quantity": 1}], key)
                results.append("success")
            except InsufficientStockError:
                results.append("failed")
            finally:
                connection.close()

        t1 = threading.Thread(target=try_order, args=(self.user1, "key1"))
        t2 = threading.Thread(target=try_order, args=(self.user2, "key2"))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(results.count("success"), 1)
        self.assertEqual(results.count("failed"), 1)
        self.item.refresh_from_db()
        self.assertEqual(self.item.stock_quantity, 0)