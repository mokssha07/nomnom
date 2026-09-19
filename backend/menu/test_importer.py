import csv
import os
import tempfile

from django.test import TestCase

from counters.models import Counter
from .csv_rules import REQUIRED_COLUMNS
from .importer import import_menu_csv
from .models import MenuItem


def make_row(**overrides):
    row = {
        "name": "Veg Thali",
        "description": "Rice, dal, sabzi",
        "price": "70.00",
        "category": "Meals",
        "counter": "Main Kitchen",
        "stock_quantity": "20",
        "low_stock_threshold": "5",
        "is_available": "true",
        "image": "thali.jpg",
    }
    row.update(overrides)
    return row


class ImporterTest(TestCase):
    def setUp(self):
        self.counter = Counter.objects.create(name="Main Kitchen", slug="main-kitchen")
        self._tmp_files = []

    def tearDown(self):
        for path in self._tmp_files:
            os.remove(path)

    def write_csv(self, rows, fieldnames=None):
        fd, path = tempfile.mkstemp(suffix=".csv")
        self._tmp_files.append(path)
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f, fieldnames=fieldnames or REQUIRED_COLUMNS, extrasaction="ignore"
            )
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_valid_row_creates_item_and_category(self):
        result = import_menu_csv(self.write_csv([make_row()]))
        self.assertEqual(result.created, ["Veg Thali"])
        self.assertEqual(result.errors, [])
        item = MenuItem.objects.get(name="Veg Thali")
        self.assertEqual(item.counter, self.counter)
        self.assertEqual(item.category.name, "Meals")
        self.assertEqual(float(item.price), 70.0)

    def test_reimport_updates_instead_of_duplicating(self):
        import_menu_csv(self.write_csv([make_row()]))
        result = import_menu_csv(self.write_csv([make_row(price="80.00")]))
        self.assertEqual(result.updated, ["Veg Thali"])
        self.assertEqual(result.created, [])
        self.assertEqual(MenuItem.objects.count(), 1)
        self.assertEqual(float(MenuItem.objects.get().price), 80.0)

    def test_reimport_with_different_case_still_updates(self):
        import_menu_csv(self.write_csv([make_row()]))
        import_menu_csv(self.write_csv([make_row(name="VEG THALI", price="90")]))
        self.assertEqual(MenuItem.objects.count(), 1)

    def test_bad_row_does_not_block_good_rows(self):
        rows = [
            make_row(name="Good One"),
            make_row(name="Bad Price", price="free"),
            make_row(name="Good Two"),
        ]
        result = import_menu_csv(self.write_csv(rows))
        self.assertEqual(sorted(result.created), ["Good One", "Good Two"])
        self.assertEqual(len(result.errors), 1)
        self.assertFalse(MenuItem.objects.filter(name="Bad Price").exists())

    def test_unknown_counter_is_rejected_not_created(self):
        rows = [make_row(name="Ghost Dish", counter="Nonexistent"), make_row(name="Real Dish")]
        result = import_menu_csv(self.write_csv(rows))
        self.assertEqual(result.created, ["Real Dish"])
        self.assertEqual(len(result.errors), 1)
        self.assertIn("Row 2", result.summary()["errors"][0])
        self.assertFalse(Counter.objects.filter(name="Nonexistent").exists())
        self.assertFalse(MenuItem.objects.filter(name="Ghost Dish").exists())

    def test_missing_header_column_imports_nothing(self):
        cols = [c for c in REQUIRED_COLUMNS if c != "price"]
        result = import_menu_csv(self.write_csv([make_row()], fieldnames=cols))
        self.assertEqual(result.created, [])
        self.assertEqual(len(result.errors), 1)
        self.assertEqual(MenuItem.objects.count(), 0)

    def test_duplicate_row_in_same_file_is_skipped(self):
        rows = [make_row(), make_row()]
        result = import_menu_csv(self.write_csv(rows))
        self.assertEqual(len(result.created), 1)
        self.assertEqual(len(result.errors), 1)
        self.assertEqual(MenuItem.objects.count(), 1)

    def test_summary_counts(self):
        rows = [make_row(name="A"), make_row(name="B", price="-1")]
        summary = import_menu_csv(self.write_csv(rows)).summary()
        self.assertEqual(summary["created_count"], 1)
        self.assertEqual(summary["error_count"], 1)