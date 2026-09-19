"""
Validates rows from a menu upload CSV before anything is written to the database.
Kept separate from the actual database import (importer.py) so validation logic
can be tested in isolation, without needing a database at all.
"""

REQUIRED_COLUMNS = [
    "name", "description", "price", "category", "counter",
    "stock_quantity", "low_stock_threshold", "is_available", "image"
]


class RowError:
    def __init__(self, row_number, message):
        self.row_number = row_number
        self.message = message

    def __repr__(self):
        return f"Row {self.row_number}: {self.message}"


def validate_header(fieldnames):
    """Returns a list of missing required columns, empty list if all present."""
    missing = [col for col in REQUIRED_COLUMNS if col not in fieldnames]
    return missing


def validate_row(row, row_number, seen_name_counter_pairs):
    """
    Checks a single CSV row (a dict from csv.DictReader).
    Returns (cleaned_data, error). Exactly one of the two will be None.
    cleaned_data, when present, has correctly-typed values ready for the importer.
    """
    name = (row.get("name") or "").strip()
    if not name:
        return None, RowError(row_number, "Missing 'name'.")

    counter = (row.get("counter") or "").strip()
    if not counter:
        return None, RowError(row_number, "Missing 'counter'.")

    category = (row.get("category") or "").strip()
    if not category:
        return None, RowError(row_number, "Missing 'category'.")

    key = (name.lower(), counter.lower())
    if key in seen_name_counter_pairs:
        return None, RowError(row_number, f"Duplicate of an earlier row: '{name}' at '{counter}'.")

    price_raw = (row.get("price") or "").strip()
    try:
        price = float(price_raw)
    except ValueError:
        return None, RowError(row_number, f"Price '{price_raw}' is not a valid number.")
    if price <= 0:
        return None, RowError(row_number, f"Price must be greater than 0, got {price}.")

    stock_raw = (row.get("stock_quantity") or "").strip()
    if stock_raw == "":
        stock_quantity = None  # unlimited stock
    else:
        try:
            stock_quantity = int(stock_raw)
        except ValueError:
            return None, RowError(row_number, f"stock_quantity '{stock_raw}' is not a whole number.")
        if stock_quantity < 0:
            return None, RowError(row_number, "stock_quantity cannot be negative.")

    threshold_raw = (row.get("low_stock_threshold") or "").strip()
    try:
        low_stock_threshold = int(threshold_raw) if threshold_raw else 5
    except ValueError:
        return None, RowError(row_number, f"low_stock_threshold '{threshold_raw}' is not a whole number.")

    is_available_raw = (row.get("is_available") or "").strip().lower()
    if is_available_raw in ("true", "1", "yes"):
        is_available = True
    elif is_available_raw in ("false", "0", "no", ""):
        is_available = False
    else:
        return None, RowError(row_number, f"is_available '{is_available_raw}' must be true/false.")

    image_filename = (row.get("image") or "").strip()

    cleaned = {
        "name": name,
        "description": (row.get("description") or "").strip(),
        "price": price,
        "category": category,
        "counter": counter,
        "stock_quantity": stock_quantity,
        "low_stock_threshold": low_stock_threshold,
        "is_available": is_available,
        "image_filename": image_filename or None,
    }
    return cleaned, None