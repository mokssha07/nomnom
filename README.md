# nomnom — Campus Canteen Order System

Students order food from their phone, and the kitchen sees each ticket on a live
board and moves it along until it's collected. Built for a closed campus LAN.

```
 Student phone ─┐                               ┌─> Kitchen board (browser)
                │   HTTP /api                   │        ▲ WebSocket /ws/kitchen/
                ▼                               │        │
          ┌──────────────┐  TCP 9000   ┌────────────┐  TCP 9001
          │ Django (ASGI)│ ──────────> │ Dispatcher │ ──────────> bridge inside Django
          │  + Postgres  │   events    │  (Python)  │             re-publishes to WS
          └──────────────┘             └────────────┘
                │                            │ UDP 9002 "I'm here" announcements
                ├─ SMTP (Gmail, or printed in dev) ─> student + manager emails
                └─ FTP 2121 <─ manager uploads menu CSV + photos
```

## What's in here

| Folder | What it is |
|---|---|
| `backend/` | Django 6 + Django REST Framework + Channels. Apps: `accounts` (users with roles), `counters`, `menu`, `orders`, `notifications`. |
| `dispatcher/` | Small standalone TCP server that fans order events out to every listener. Plain Python, no dependencies. |
| `frontend/` | React 19 + Vite. Student pages (menu, cart, my orders) and the staff kitchen board. |
| `docs/API.md` | The API contract. Keep it in sync with the code. |
| `docs/NETWORKING.md` | Email setup (Gmail), and why plain FTP is fine on a campus LAN. |
| `verify_all.sh` | Run before committing: tests, migrations, settings and git hygiene checks. |

## Roles

- **student**: anyone who registers. Browses the menu, places and cancels their own orders.
- **staff**: moves orders through `PLACED → ACCEPTED → PREPARING → READY → COMPLETED` on the kitchen board.
- **manager**: same as staff. Menu uploads use the FTP login in `.env`, and reports go to `MANAGER_EMAIL`.

Staff and manager accounts are created in the Django admin (`/admin/`). Nobody can self-register as staff.

## Setup

You need Python 3.12+, Node 20+ and PostgreSQL.

### 1. Database

Create a Postgres database and user, e.g. in `psql`:

```sql
CREATE USER canteen WITH PASSWORD 'changeme';
CREATE DATABASE canteen OWNER canteen;
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows  (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
cp ../.env.example .env         # then edit .env: DATABASE_URL, SECRET_KEY, DEBUG=True
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver      # localhost only, on purpose: see below
```

Keep Django on `127.0.0.1`. Phones and other laptops reach it through the Vite
server, which passes on their real IP for the login rate limit. Exposing Django
directly (`0.0.0.0:8000`) would let anyone fake that IP and dodge the limit.

In `/admin/`, create at least one Counter, some Categories and Menu items (or import a
CSV, see below), and set a user's role to `staff` to use the kitchen board.

### 3. Dispatcher (for the live kitchen feed)

From the project root, in a second terminal:

```bash
python -m dispatcher.server
```

Optional. If it isn't running, orders still work and the kitchen board falls back to
refreshing every 4 seconds.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` and `/ws` to Django on port 8000.

To use the app from phones on the same Wi-Fi, run `npm run dev -- --host` and add the
machine's LAN IP to `ALLOWED_HOSTS` in `backend/.env`.

### 5. Email (optional)

Students are emailed at their sign-up address when an order is placed and when it's
ready to collect. With no mail settings, those emails just print in the Django terminal.

To send real email through Gmail, add this to `backend/.env` and restart Django:

```
EMAIL_HOST=smtp.gmail.com
EMAIL_HOST_USER=yourcanteen@gmail.com
EMAIL_HOST_PASSWORD=<16-letter App Password from https://myaccount.google.com/apppasswords>
```

(The App Password needs 2-Step Verification turned on; your normal Gmail password
won't work.) Details and other options: `docs/NETWORKING.md`.

Without email, students still get a browser notification when their order is ready.

## Menu uploads

The menu can be loaded from a CSV (format: `docs/menu_upload_format.csv`) with optional
photos alongside it.

```bash
python manage.py run_ftp_server          # managers upload over FTP (port 2121)
python manage.py import_menu --watch     # imports new CSVs as they arrive
python manage.py import_menu             # or: import once and exit
```

## Daily jobs

```bash
python manage.py backup_sales            # today's sales → CSV → backup FTP server
python manage.py send_daily_report       # emails the day's summary to the manager
```

Both take `--date YYYY-MM-DD`. Schedule them with Task Scheduler / cron.

## Tests

```bash
bash verify_all.sh                          # everything, from the project root
cd backend && python manage.py test         # Django tests (needs Postgres for the concurrency test)
python -m unittest discover -s dispatcher -p "test_*.py" -t .   # dispatcher tests (from the root)
cd frontend && npm test                     # frontend unit tests
```

## How the important parts work

- **No overselling.** `place_order` locks each menu item row while it checks and reduces
  stock, so two students can't both buy the last plate. `orders/tests.py` proves it.
- **No double orders.** The frontend sends one `idempotency_key` per checkout. Retrying
  with the same key returns the same order instead of creating a second one.
- **Server decides the price.** The total is always calculated by the backend.
- **The dispatcher can't break ordering.** Events are sent after the database commit,
  and if the dispatcher is down they're dropped with a warning.
- **Swappable API client.** Pages only import `frontend/src/api/index.js`. Set
  `USE_MOCK = true` there to run the frontend without a backend.

## Known limits (deliberate for a campus LAN project)

- Plain FTP, not FTPS/SFTP. See `docs/NETWORKING.md`.
- The Channels layer is in-memory, so run a single Django process. Use Redis
  (`channels-redis`) for more than one.
- The kitchen WebSocket token travels in the URL, because browsers can't set headers on
  WebSockets. Fine on a trusted LAN; use HTTPS/WSS anywhere else.
