import shutil
import time
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from menu.importer import import_menu_csv


class Command(BaseCommand):
    help = (
        "Imports every .csv in the menu upload folder, then moves it to processed/. "
        "Use --watch to keep running and import new files automatically."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--folder",
            default=None,
            help="Folder to scan (default: <backend>/ftp_data/menu)",
        )
        parser.add_argument(
            "--watch",
            action="store_true",
            help="Keep running and import new CSV files as they appear.",
        )
        parser.add_argument(
            "--interval",
            type=float,
            default=5.0,
            help="Seconds between folder checks in watch mode (default 5).",
        )
        parser.add_argument(
            "--settle",
            type=float,
            default=3.0,
            help="In watch mode, ignore CSVs modified less than this many seconds "
            "ago, so half-uploaded files are never read (default 3).",
        )

    def handle(self, *args, **options):
        if options["folder"]:
            folder = Path(options["folder"])
        else:
            folder = Path(settings.BASE_DIR) / "ftp_data" / "menu"

        (folder / "processed").mkdir(parents=True, exist_ok=True)

        if not options["watch"]:
            count = self._import_folder(folder, settle=0)
            if count == 0:
                self.stdout.write("No CSV files to import.")
            return

        self.stdout.write(
            f"Watching {folder} every {options['interval']}s. Press Ctrl+C to stop."
        )
        try:
            while True:
                close_old_connections()  # avoid stale database connections
                try:
                    self._import_folder(folder, settle=options["settle"])
                except Exception as e:
                    self.stderr.write(f"Watcher error (will keep running): {e}")
                time.sleep(options["interval"])
        except KeyboardInterrupt:
            self.stdout.write("Stopped.")

    def _import_folder(self, folder, settle):
        """Imports every settled CSV in folder. Returns how many files were handled."""
        processed = folder / "processed"
        handled = 0

        for csv_path in sorted(folder.glob("*.csv")):
            if settle and time.time() - csv_path.stat().st_mtime < settle:
                continue  # possibly still being uploaded; check again next round

            handled += 1
            self.stdout.write(f"Importing {csv_path.name} ...")
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            report_lines = []
            result = None

            try:
                result = import_menu_csv(csv_path, image_folder=folder)
                summary = result.summary()
                report_lines.append(f"Created:  {summary['created_count']}")
                report_lines.append(f"Updated:  {summary['updated_count']}")
                report_lines.append(f"Errors:   {summary['error_count']}")
                report_lines.extend(summary["errors"])
                if summary["warnings"]:
                    report_lines.append(f"Warnings: {len(summary['warnings'])}")
                    report_lines.extend(summary["warnings"])
            except Exception as e:
                # A file we can't read at all must not crash the whole run.
                report_lines.append(f"Could not read file: {e}")

            for line in report_lines:
                self.stdout.write("  " + line)

            # Images are already copied into media/, so archive the originals.
            if result:
                for name in sorted(set(result.images_used)):
                    src = folder / name
                    if src.exists():
                        shutil.move(str(src), str(processed / f"{stamp}-{name}"))

            target = processed / f"{stamp}-{csv_path.name}"
            shutil.move(str(csv_path), str(target))
            Path(str(target) + ".report.txt").write_text(
                "\n".join(report_lines) + "\n", encoding="utf-8"
            )

        return handled
