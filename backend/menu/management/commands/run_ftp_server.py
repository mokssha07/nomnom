import logging
import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from dotenv import find_dotenv, load_dotenv
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer


class Command(BaseCommand):
    help = (
        "Runs the FTP server the canteen manager uses to upload the menu CSV and "
        "images. The manager is locked into the upload folder. "
        "NOTE: plain FTP is unencrypted; only use it on a trusted campus LAN."
    )

    def add_arguments(self, parser):
        parser.add_argument("--host", default="0.0.0.0", help="Address to listen on.")
        parser.add_argument("--port", type=int, default=2121, help="Control port (default 2121).")
        parser.add_argument("--folder", default=None, help="Upload folder (default: <backend>/ftp_data/menu)")
        parser.add_argument("--passive-start", type=int, default=60000)
        parser.add_argument("--passive-end", type=int, default=60010)

    def handle(self, *args, **options):
        load_dotenv(find_dotenv(usecwd=True))

        password = os.environ.get("FTP_MANAGER_PASSWORD", "")
        username = os.environ.get("FTP_MANAGER_USER", "manager")
        if len(password) < 8:
            raise CommandError(
                "Set FTP_MANAGER_PASSWORD (at least 8 characters) before starting the server."
            )

        if options["folder"]:
            folder = Path(options["folder"])
        else:
            folder = Path(settings.BASE_DIR) / "ftp_data" / "menu"
        folder = folder.resolve()
        (folder / "processed").mkdir(parents=True, exist_ok=True)

        authorizer = DummyAuthorizer()
        # e=cd/list  l=list  r=download  a=resume upload  w=upload  d=delete
        # No m (mkdir) or f (rename): the manager only needs to drop files in.
        authorizer.add_user(username, password, str(folder), perm="elrawd")

        handler = FTPHandler
        handler.authorizer = authorizer
        handler.banner = "Canteen menu upload server ready."
        handler.passive_ports = range(options["passive_start"], options["passive_end"] + 1)

        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

        server = FTPServer((options["host"], options["port"]), handler)
        server.max_cons = 20
        server.max_cons_per_ip = 5

        self.stdout.write(
            f"FTP server on {options['host']}:{options['port']}, "
            f"user '{username}', folder {folder}. Press Ctrl+C to stop."
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            self.stdout.write("Stopping.")
        finally:
            server.close_all()
