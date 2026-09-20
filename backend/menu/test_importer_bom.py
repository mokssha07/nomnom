import tempfile
from pathlib import Path

from django.test import TestCase

from counters.models import Counter
from menu.importer import import_menu_csv
from menu.models import MenuItem

HEADER = ("name,description,price,category,counter,"
          "stock_quantity,low_stock_threshold,is_available,image\n")


class CsvEncodingTest(TestCase):
    def setUp(self):
        Counter.objects.create(name="Main Kitchen", slug="main-kitchen")

    def csv_file(self, text, encoding):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = Path(tmp.name) / "menu.csv"
        path.write_bytes(text.encode(encoding))
        return path

    def test_csv_saved_by_excel_with_a_bom_still_imports(self):
        # Excel's "CSV UTF-8" adds a hidden marker (BOM) at the start of the file.
        path = self.csv_file(HEADER + "Samosa,Two,25.00,Snacks,Main Kitchen,40,5,true,\n",
                             "utf-8-sig")
        result = import_menu_csv(path)
        self.assertEqual(result.errors, [])
        self.assertEqual(result.created, ["Samosa"])

    def test_plain_utf8_without_a_bom_still_imports(self):
        path = self.csv_file(HEADER + "Samosa,Two,25.00,Snacks,Main Kitchen,40,5,true,\n",
                             "utf-8")
        result = import_menu_csv(path)
        self.assertEqual(result.errors, [])
        self.assertEqual(result.created, ["Samosa"])

    def test_accented_and_indian_characters_survive(self):
        path = self.csv_file(HEADER + "Crêpe,Crisp crêpe with चटनी,60.00,Snacks,Main Kitchen,5,2,true,\n",
                             "utf-8-sig")
        import_menu_csv(path)
        item = MenuItem.objects.get(name="Crêpe")
        self.assertIn("चटनी", item.description)
