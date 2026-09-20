import csv
from decimal import Decimal
from pathlib import Path

from django.core.files import File
from django.db import transaction
from .csv_rules import validate_header, validate_row
from .models import Category, MenuItem
from counters.models import Counter

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


class ImportResult:
    def __init__(self):
        self.created = []
        self.updated = []
        self.errors = []
        self.warnings = []
        self.images_used = []

    def summary(self):
        return {
            "created_count": len(self.created),
            "updated_count": len(self.updated),
            "error_count": len(self.errors),
            "errors": [str(e) for e in self.errors],
            "warnings": [str(w) for w in self.warnings],
        }


def import_menu_csv(file_path, image_folder=None):
    """
    Reads a menu CSV and creates/updates MenuItems. Each valid row is applied in
    its own transaction, so one bad row later in the file can never undo good
    rows that were already saved earlier. Rows are matched on (name, counter),
    case-insensitively, so re-uploading the same CSV updates existing items
    instead of duplicating them.
    Unknown counters are rejected, not auto-created, since a wrong counter name
    could silently misroute real orders. Categories ARE auto-created, since
    getting a new category wrong is low-risk compared to a wrong counter.
    If image_folder is given, each row's image file is looked up there. A missing
    image is a warning, not an error: the item still imports.
    """
    result = ImportResult()
    seen_pairs = set()

    with open(file_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        missing_columns = validate_header(reader.fieldnames or [])
        if missing_columns:
            result.errors.append(f"CSV is missing required columns: {missing_columns}")
            return result

        for row_number, row in enumerate(reader, start=2):  # row 1 is the header
            cleaned, error = validate_row(row, row_number, seen_pairs)
            if error:
                result.errors.append(error)
                continue

            seen_pairs.add((cleaned["name"].lower(), cleaned["counter"].lower()))

            try:
                _save_row(cleaned, row_number, result, image_folder)
            except Exception as e:
                result.errors.append(f"Row {row_number}: unexpected error - {e}")

    return result


def _attach_image(item, filename, row_number, result, image_folder):
    """Sets item.image from a file in image_folder. Does not save the item."""
    if not filename or image_folder is None:
        return

    safe_name = Path(filename).name
    if safe_name != filename or Path(filename).suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        result.warnings.append(
            f"Row {row_number}: '{filename}' is not a valid image filename "
            "(use .jpg, .jpeg, .png or .webp, no folders). Image skipped."
        )
        return

    path = Path(image_folder) / safe_name
    if not path.is_file():
        result.warnings.append(
            f"Row {row_number}: image '{filename}' was not found in the upload folder. "
            "Item imported without a new image."
        )
        return

    with open(path, "rb") as f:
        item.image.save(safe_name, File(f), save=False)
    result.images_used.append(safe_name)


@transaction.atomic
def _save_row(cleaned, row_number, result, image_folder=None):
    try:
        counter = Counter.objects.get(name__iexact=cleaned["counter"])
    except Counter.DoesNotExist:
        result.errors.append(
            f"Row {row_number}: counter '{cleaned['counter']}' does not exist. "
            "Create it in admin first."
        )
        return

    category, _ = Category.objects.get_or_create(name=cleaned["category"])

    item = MenuItem.objects.filter(name__iexact=cleaned["name"], counter=counter).first()
    created = item is None
    if created:
        item = MenuItem(name=cleaned["name"], counter=counter)

    item.description = cleaned["description"]
    item.price = Decimal(str(cleaned["price"]))
    item.category = category
    item.stock_quantity = cleaned["stock_quantity"]
    item.low_stock_threshold = cleaned["low_stock_threshold"]
    item.is_available = cleaned["is_available"]

    _attach_image(item, cleaned["image_filename"], row_number, result, image_folder)
    item.save()

    if created:
        result.created.append(item.name)
    else:
        result.updated.append(item.name)