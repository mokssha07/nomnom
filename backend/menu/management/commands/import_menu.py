import shutil
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from menu.importer import import_menu_csv


class Command(BaseCommand):
    help = "Imports every .csv in the menu upload folder, then moves it to processed/."

    def add_arguments(self, parser):
        parser.add_argument(
            "--folder",
            default=None,
            help="Folder to scan (default: <backend>/ftp_data/menu)",
        )

    def handle(self, *args, **options):
        if options["folder"]:
            folder = Path(options["folder"])
        else:
            folder = Path(settings.BASE_DIR) / "ftp_data" / "menu"

        processed = folder / "processed"
        processed.mkdir(parents=True, exist_ok=True)

        csv_files = sorted(folder.glob("*.csv"))
        if not csv_files:
            self.stdout.write("No CSV files to import.")
            return

        for csv_path in csv_files:
            self.stdout.write(f"Importing {csv_path.name} ...")
            report_lines = []

            try:
                result = import_menu_csv(csv_path)
                summary = result.summary()
                report_lines.append(f"Created: {summary['created_count']}")
                report_lines.append(f"Updated: {summary['updated_count']}")
                report_lines.append(f"Errors:  {summary['error_count']}")
                report_lines.extend(summary["errors"])
            except Exception as e:
                # A file we can't read at all must not crash the whole run.
                report_lines.append(f"Could not read file: {e}")

            for line in report_lines:
                self.stdout.write("  " + line)

            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            target = processed / f"{stamp}-{csv_path.name}"
            shutil.move(str(csv_path), str(target))
            Path(str(target) + ".report.txt").write_text(
                "\n".join(report_lines) + "\n", encoding="utf-8"
            )