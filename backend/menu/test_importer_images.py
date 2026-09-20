import csv
import os
import shutil
import tempfile

from django.test import TestCase, override_settings
from PIL import Image

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


class ImporterImageTest(TestCase):
    def setUp(self):
        Counter.objects.create(name="Main Kitchen", slug="main-kitchen")
        self.folder = tempfile.mkdtemp()
        self.media = tempfile.mkdtemp()
        override = override_settings(MEDIA_ROOT=self.media)
        override.enable()
        self.addCleanup(override.disable)
        self.addCleanup(shutil.rmtree, self.folder, True)
        self.addCleanup(shutil.rmtree, self.media, True)

    def write_csv(self, rows):
        path = os.path.join(self.folder, "menu.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=REQUIRED_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def make_image(self, name):
        Image.new("RGB", (10, 10), "red").save(os.path.join(self.folder, name))

    def test_image_found_is_attached(self):
        self.make_image("thali.jpg")
        result = import_menu_csv(self.write_csv([make_row()]), image_folder=self.folder)
        self.assertEqual(result.warnings, [])
        self.assertEqual(result.images_used, ["thali.jpg"])
        item = MenuItem.objects.get(name="Veg Thali")
        self.assertTrue(item.image.name.startswith("menu/"))

    def test_missing_image_warns_but_item_still_imports(self):
        result = import_menu_csv(self.write_csv([make_row()]), image_folder=self.folder)
        self.assertEqual(result.created, ["Veg Thali"])
        self.assertEqual(len(result.warnings), 1)
        self.assertEqual(MenuItem.objects.get(name="Veg Thali").image.name, "")

    def test_filename_with_folder_is_rejected(self):
        result = import_menu_csv(
            self.write_csv([make_row(image="../x.jpg")]), image_folder=self.folder
        )
        self.assertEqual(result.created, ["Veg Thali"])
        self.assertEqual(len(result.warnings), 1)
        self.assertEqual(MenuItem.objects.get().image.name, "")

    def test_disallowed_extension_is_rejected(self):
        self.make_image("thali.gif")
        result = import_menu_csv(
            self.write_csv([make_row(image="thali.gif")]), image_folder=self.folder
        )
        self.assertEqual(len(result.warnings), 1)
        self.assertEqual(MenuItem.objects.get().image.name, "")

    def test_no_image_folder_means_images_are_ignored(self):
        result = import_menu_csv(self.write_csv([make_row()]))
        self.assertEqual(result.warnings, [])
        self.assertEqual(result.created, ["Veg Thali"])