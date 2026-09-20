import csv
import ftplib
import os
import tempfile
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from django.utils import timezone

from counters.models import Counter
from menu.models import Category, MenuItem
from orders.management.commands.backup_sales import (
    CSV_COLUMNS, build_rows, summarize, upload_file,
)
from orders.models import Order, OrderItem

User = get_user_model()
DAY = date(2026, 9, 20)
MODULE = "orders.management.commands.backup_sales"


def at(day, hour):
    return timezone.make_aware(datetime(day.year, day.month, day.day, hour, 0))


class BackupTestBase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="student1", password="pass12345")
        self.counter = Counter.objects.create(name="Main Kitchen", slug="main-kitchen")
        self.category = Category.objects.create(name="Snacks")
        self.samosa = MenuItem.objects.create(
            name="Samosa", price=Decimal("25.00"), category=self.category,
            counter=self.counter, stock_quantity=100)
        self.tea = MenuItem.objects.create(
            name="Masala Chai", price=Decimal("15.00"), category=self.category,
            counter=self.counter, stock_quantity=100)
        self.n = 0

    def make_order(self, day, hour, status, lines):
        """lines: [(menu_item, quantity), ...]. Created directly, so nothing is published."""
        self.n += 1
        total = sum(item.price * qty for item, qty in lines)
        order = Order.objects.create(
            order_number=f"ORD-T-{self.n:04d}", student=self.user, counter=self.counter,
            status=status, total_amount=total, idempotency_key=f"key-{self.n}")
        Order.objects.filter(pk=order.pk).update(created_at=at(day, hour))
        for item, qty in lines:
            OrderItem.objects.create(order=order, menu_item=item, quantity=qty,
                                     unit_price_at_order=item.price)
        return order


class BuildRowsTests(BackupTestBase):
    def test_only_the_requested_day_is_included(self):
        self.make_order(DAY, 9, "COMPLETED", [(self.samosa, 2)])
        self.make_order(date(2026, 9, 19), 23, "COMPLETED", [(self.samosa, 1)])
        self.make_order(date(2026, 9, 21), 0, "COMPLETED", [(self.samosa, 1)])
        rows = build_rows(DAY)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["order_number"], "ORD-T-0001")

    def test_one_row_per_line_with_correct_totals(self):
        self.make_order(DAY, 10, "COMPLETED", [(self.samosa, 2), (self.tea, 3)])
        rows = build_rows(DAY)
        self.assertEqual(len(rows), 2)
        by_item = {r["item"]: r for r in rows}
        self.assertEqual(by_item["Samosa"]["line_total"], "50.00")
        self.assertEqual(by_item["Masala Chai"]["line_total"], "45.00")
        self.assertEqual(by_item["Samosa"]["order_total"], "95.00")
        self.assertEqual(by_item["Samosa"]["student"], "student1")
        self.assertEqual(set(rows[0]), set(CSV_COLUMNS))

    def test_revenue_counts_completed_orders_only(self):
        self.make_order(DAY, 9, "COMPLETED", [(self.samosa, 2)])     # 50
        self.make_order(DAY, 10, "CANCELLED", [(self.samosa, 4)])    # not revenue
        self.make_order(DAY, 11, "PREPARING", [(self.tea, 2)])       # not yet revenue
        orders, lines, revenue = summarize(build_rows(DAY))
        self.assertEqual((orders, lines), (3, 3))
        self.assertEqual(revenue, Decimal("50.00"))

    def test_empty_day_gives_no_rows(self):
        self.assertEqual(build_rows(DAY), [])
        self.assertEqual(summarize([]), (0, 0, Decimal("0.00")))


class CommandTests(BackupTestBase):
    def test_no_upload_writes_a_valid_csv(self):
        self.make_order(DAY, 9, "COMPLETED", [(self.samosa, 2)])
        with tempfile.TemporaryDirectory() as tmp:
            call_command("backup_sales", "--date", "2026-09-20", "--no-upload",
                         "--local-dir", tmp, stdout=MagicMock())
            path = Path(tmp) / "sales-2026-09-20.csv"
            with open(path, newline="", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["item"], "Samosa")
        self.assertEqual(list(rows[0].keys()), CSV_COLUMNS)

    def test_empty_day_still_writes_a_header_only_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            call_command("backup_sales", "--date", "2026-09-20", "--no-upload",
                         "--local-dir", tmp, stdout=MagicMock())
            text = (Path(tmp) / "sales-2026-09-20.csv").read_text()
        self.assertEqual(text.strip(), ",".join(CSV_COLUMNS))

    def test_bad_date_is_rejected(self):
        with self.assertRaises(CommandError):
            call_command("backup_sales", "--date", "20-09-2026", "--no-upload")

    def test_missing_password_is_rejected_before_any_work(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(CommandError) as ctx:
                call_command("backup_sales", "--date", "2026-09-20")
        self.assertIn("BACKUP_FTP_PASSWORD", str(ctx.exception))


class UploadTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "sales-2026-09-20.csv"
        self.path.write_text("a,b\n1,2\n")
        self.size = self.path.stat().st_size

    def kwargs(self, **extra):
        base = dict(host="h", port=2122, user="u", password="p", pause=0)
        base.update(extra)
        return base

    def fake_ftp(self, cls):
        ftp = MagicMock()
        cls.return_value.__enter__.return_value = ftp
        return ftp

    @patch(f"{MODULE}.time.sleep")
    @patch(f"{MODULE}.ftplib.FTP")
    def test_success_verifies_size(self, cls, _sleep):
        ftp = self.fake_ftp(cls)
        ftp.size.return_value = self.size
        self.assertEqual(upload_file(self.path, **self.kwargs()), self.size)
        ftp.login.assert_called_once_with("u", "p")
        self.assertEqual(ftp.storbinary.call_args[0][0], f"STOR {self.path.name}")

    @patch(f"{MODULE}.time.sleep")
    @patch(f"{MODULE}.ftplib.FTP")
    def test_retries_after_a_network_error_then_succeeds(self, cls, _sleep):
        ftp = self.fake_ftp(cls)
        ftp.connect.side_effect = [OSError("connection refused"), None]
        ftp.size.return_value = self.size
        upload_file(self.path, **self.kwargs())
        self.assertEqual(ftp.connect.call_count, 2)

    @patch(f"{MODULE}.time.sleep")
    @patch(f"{MODULE}.ftplib.FTP")
    def test_gives_up_after_all_attempts_and_keeps_the_local_file(self, cls, _sleep):
        ftp = self.fake_ftp(cls)
        ftp.connect.side_effect = OSError("connection refused")
        with self.assertRaises(CommandError) as ctx:
            upload_file(self.path, **self.kwargs(attempts=3))
        self.assertEqual(ftp.connect.call_count, 3)
        self.assertIn("local copy is safe", str(ctx.exception))
        self.assertTrue(self.path.exists())

    @patch(f"{MODULE}.time.sleep")
    @patch(f"{MODULE}.ftplib.FTP")
    def test_size_mismatch_counts_as_a_failure(self, cls, _sleep):
        ftp = self.fake_ftp(cls)
        ftp.size.return_value = self.size - 1
        with self.assertRaises(CommandError) as ctx:
            upload_file(self.path, **self.kwargs(attempts=2))
        self.assertIn("size mismatch", str(ctx.exception))

    @patch(f"{MODULE}.time.sleep")
    @patch(f"{MODULE}.ftplib.FTP")
    def test_permission_error_from_server_is_reported(self, cls, _sleep):
        ftp = self.fake_ftp(cls)
        ftp.login.side_effect = ftplib.error_perm("530 Authentication failed.")
        with self.assertRaises(CommandError) as ctx:
            upload_file(self.path, **self.kwargs(attempts=1))
        self.assertIn("530", str(ctx.exception))
