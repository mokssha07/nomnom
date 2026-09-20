"""
Sends the daily sales summary as an email, with the CSV attached, to the manager.
Reuses the exact same data-gathering logic as backup_sales so the two commands
never disagree about what "today's sales" means.

Run every night, e.g.:   python manage.py send_daily_report
"""
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from orders.management.commands.backup_sales import build_rows, summarize, write_csv
from notifications.emails import send_daily_report_async


class Command(BaseCommand):
    help = "Emails the daily sales summary (with CSV attached) to the manager."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Day to report on, YYYY-MM-DD (default: today).")

    def handle(self, *args, **options):
        if options["date"]:
            try:
                day = datetime.strptime(options["date"], "%Y-%m-%d").date()
            except ValueError:
                raise CommandError("--date must look like 2026-09-20.")
        else:
            day = timezone.localdate()

        rows = build_rows(day)
        order_count, line_count, revenue = summarize(rows)

        local_dir = Path(settings.BASE_DIR) / "backups" / "sales"
        path = local_dir / f"sales-{day}.csv"
        write_csv(path, rows)

        self.stdout.write(
            f"Sales for {day}: {order_count} orders, {line_count} line items, "
            f"completed revenue {revenue:.2f}"
        )

        send_daily_report_async(day, order_count, line_count, revenue, path)

        self.stdout.write(self.style.SUCCESS(f"Report email queued for {day}."))