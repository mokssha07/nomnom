from django.test import SimpleTestCase
from .csv_rules import validate_header, validate_row, REQUIRED_COLUMNS


class ValidateHeaderTest(SimpleTestCase):
    def test_all_columns_present_returns_empty(self):
        missing = validate_header(REQUIRED_COLUMNS)
        self.assertEqual(missing, [])

    def test_missing_column_is_reported(self):
        headers = [c for c in REQUIRED_COLUMNS if c != "price"]
        missing = validate_header(headers)
        self.assertIn("price", missing)


class ValidateRowTest(SimpleTestCase):
    def base_row(self, **overrides):
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

    def test_valid_row_passes(self):
        cleaned, error = validate_row(self.base_row(), 2, set())
        self.assertIsNone(error)
        self.assertEqual(cleaned["name"], "Veg Thali")
        self.assertEqual(cleaned["price"], 70.0)
        self.assertEqual(cleaned["stock_quantity"], 20)
        self.assertTrue(cleaned["is_available"])

    def test_missing_name_fails(self):
        cleaned, error = validate_row(self.base_row(name=""), 2, set())
        self.assertIsNone(cleaned)
        self.assertIn("name", error.message)

    def test_missing_counter_fails(self):
        cleaned, error = validate_row(self.base_row(counter=""), 2, set())
        self.assertIsNone(cleaned)
        self.assertIn("counter", error.message)

    def test_zero_price_fails(self):
        cleaned, error = validate_row(self.base_row(price="0"), 2, set())
        self.assertIsNone(cleaned)
        self.assertIn("greater than 0", error.message)

    def test_negative_price_fails(self):
        cleaned, error = validate_row(self.base_row(price="-5"), 2, set())
        self.assertIsNone(cleaned)

    def test_non_numeric_price_fails(self):
        cleaned, error = validate_row(self.base_row(price="free"), 2, set())
        self.assertIsNone(cleaned)
        self.assertIn("not a valid number", error.message)

    def test_blank_stock_means_unlimited(self):
        cleaned, error = validate_row(self.base_row(stock_quantity=""), 2, set())
        self.assertIsNone(error)
        self.assertIsNone(cleaned["stock_quantity"])

    def test_negative_stock_fails(self):
        cleaned, error = validate_row(self.base_row(stock_quantity="-1"), 2, set())
        self.assertIsNone(cleaned)

    def test_non_numeric_stock_fails(self):
        cleaned, error = validate_row(self.base_row(stock_quantity="many"), 2, set())
        self.assertIsNone(cleaned)

    def test_blank_threshold_defaults_to_five(self):
        cleaned, error = validate_row(self.base_row(low_stock_threshold=""), 2, set())
        self.assertIsNone(error)
        self.assertEqual(cleaned["low_stock_threshold"], 5)

    def test_is_available_false_variants(self):
        for val in ["false", "0", "no", ""]:
            cleaned, error = validate_row(self.base_row(is_available=val), 2, set())
            self.assertIsNone(error)
            self.assertFalse(cleaned["is_available"])

    def test_is_available_true_variants(self):
        for val in ["true", "1", "yes"]:
            cleaned, error = validate_row(self.base_row(is_available=val), 2, set())
            self.assertIsNone(error)
            self.assertTrue(cleaned["is_available"])

    def test_invalid_is_available_fails(self):
        cleaned, error = validate_row(self.base_row(is_available="maybe"), 2, set())
        self.assertIsNone(cleaned)

    def test_duplicate_name_counter_fails(self):
        seen = {("veg thali", "main kitchen")}
        cleaned, error = validate_row(self.base_row(), 3, seen)
        self.assertIsNone(cleaned)
        self.assertIn("Duplicate", error.message)

    def test_blank_image_is_none(self):
        cleaned, error = validate_row(self.base_row(image=""), 2, set())
        self.assertIsNone(error)
        self.assertIsNone(cleaned["image_filename"])

    def test_case_insensitive_duplicate_check(self):
        seen = {("veg thali", "main kitchen")}
        cleaned, error = validate_row(self.base_row(name="VEG THALI", counter="MAIN KITCHEN"), 3, seen)
        self.assertIsNone(cleaned)
        self.assertIn("Duplicate", error.message)