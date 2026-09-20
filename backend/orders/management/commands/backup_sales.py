"""
Daily sales backup.

Writes one CSV row per order line for a single day, keeps a local copy, then
uploads that CSV to a backup FTP server with ftplib (the client side of FTP).

Run every night, e.g.:   python manage.py backup_sales
Re-running is safe: the same day's file is simply overwritten.

NOTE: plain FTP is unencrypted. Acceptable only on a closed campus LAN.
"""
import csv
import ftplib
import os
import time
from datetime import datetime, time as dtime, timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from orders.models import OrderItem

CSV_COLUMNS = [
    "order_number", "order_time", "counter", "student", "status",
    "item", "quantity", "unit_price", "line_total", "order_total",
]


def day_bounds(day):
    """Start (inclusive) and end (exclusive) of a calendar day in the project's timezone."""
    start = timezone.make_aware(datetime.combine(day, dtime.min))
    return start, start + timedelta(days=1)


def build_rows(day):
    """One dict per order line for orders created on `day`, oldest first."""
    start, end = day_bounds(day)
    lines = (
        OrderItem.objects
        .filter(order__created_at__gte=start, order__created_at__lt=end)
        .select_related("order", "order__counter", "order__student", "menu_item")
        .order_by("order__created_at", "order__id", "id")
    )
    rows = []
    for line in lines:
        order = line.order
        rows.append({
            "order_number": order.order_number,
            "order_time": timezone.localtime(order.created_at).strftime("%Y-%m-%d %H:%M:%S"),
            "counter": order.counter.name,
            "student": order.student.get_username(),
            "status": order.status,
            "item": line.menu_item.name,
            "quantity": line.quantity,
            "unit_price": f"{line.unit_price_at_order:.2f}",
            "line_total": f"{line.unit_price_at_order * line.quantity:.2f}",
            "order_total": f"{order.total_amount:.2f}",
        })
    return rows


def summarize(rows):
    """(number of orders, number of lines, revenue from COMPLETED orders only)."""
    orders = {r["order_number"] for r in rows}
    revenue = sum((Decimal(r["line_total"]) for r in rows if r["status"] == "COMPLETED"),
                  Decimal("0.00"))
    return len(orders), len(rows), revenue


def write_csv(path, rows):
    """Write atomically: a half-written file never replaces a good one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def upload_file(path, *, host, port, user, password, remote_dir="/",
                attempts=3, timeout=10, pause=2.0):
    """
    Upload `path` to an FTP server and check the remote size matches.
    Retries on network/FTP errors. Returns the verified byte count, or None
    if the server can't report sizes. Raises CommandError if every attempt fails.
    """
    local_size = path.stat().st_size
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            with ftplib.FTP() as ftp:
                ftp.connect(host, port, timeout=timeout)
                ftp.login(user, password)
                if remote_dir and remote_dir != "/":
                    ftp.cwd(remote_dir)
                with open(path, "rb") as f:
                    ftp.storbinary(f"STOR {path.name}", f)
                remote_size = ftp.size(path.name)
            if remote_size is not None and remote_size != local_size:
                raise ftplib.Error(
                    f"size mismatch: sent {local_size} bytes, server has {remote_size}"
                )
            return remote_size
        except ftplib.all_errors as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(pause)
    raise CommandError(
        f"Upload to {host}:{port} failed after {attempts} attempts: {last_error}. "
        f"The local copy is safe at {path}; run the command again when the backup server is up."
    )


class Command(BaseCommand):
    help = "Writes one day's sales to a CSV and uploads it to the backup FTP server."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Day to back up, YYYY-MM-DD (default: today).")
        parser.add_argument("--host", default=os.environ.get("BACKUP_FTP_HOST", "127.0.0.1"))
        parser.add_argument("--port", type=int,
                            default=int(os.environ.get("BACKUP_FTP_PORT", "2122")))
        parser.add_argument("--user", default=os.environ.get(
            "BACKUP_FTP_USER", os.environ.get("FTP_MANAGER_USER", "manager")))
        parser.add_argument("--remote-dir", default=os.environ.get("BACKUP_FTP_DIR", "/"))
        parser.add_argument("--local-dir", default=None,
                            help="Where to keep the local copy (default: <backend>/backups/sales).")
        parser.add_argument("--attempts", type=int, default=3)
        parser.add_argument("--no-upload", action="store_true",
                            help="Only write the local CSV; skip the FTP upload.")

    def handle(self, *args, **options):
        if options["date"]:
            try:
                day = datetime.strptime(options["date"], "%Y-%m-%d").date()
            except ValueError:
                raise CommandError("--date must look like 2026-09-20.")
        else:
            day = timezone.localdate()

        password = os.environ.get("BACKUP_FTP_PASSWORD") or os.environ.get("FTP_MANAGER_PASSWORD", "")
        if not options["no_upload"] and not password:
            raise CommandError(
                "Set BACKUP_FTP_PASSWORD (or FTP_MANAGER_PASSWORD) in .env, "
                "or use --no-upload."
            )

        rows = build_rows(day)
        order_count, line_count, revenue = summarize(rows)
        self.stdout.write(
            f"Sales for {day}: {order_count} orders, {line_count} line items, "
            f"completed revenue {revenue:.2f}"
        )

        local_dir = Path(options["local_dir"]) if options["local_dir"] \
            else Path(settings.BASE_DIR) / "backups" / "sales"
        path = local_dir / f"sales-{day}.csv"
        write_csv(path, rows)
        self.stdout.write(f"Saved {path}")

        if options["no_upload"]:
            return

        verified = upload_file(
            path, host=options["host"], port=options["port"], user=options["user"],
            password=password, remote_dir=options["remote_dir"], attempts=options["attempts"],
        )
        detail = f"verified {verified} bytes" if verified is not None else "size not verified"
        self.stdout.write(self.style.SUCCESS(
            f"Uploaded to {options['host']}:{options['port']}{options['remote_dir']} ({detail})."
        ))
