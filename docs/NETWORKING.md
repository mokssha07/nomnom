# Networking Notes — Campus Canteen Order System

## FTP security limitation (Stage 3)

The menu upload and sales backup servers use plain FTP, which transmits credentials
and file contents unencrypted. This is acceptable only because this system runs on a
closed campus LAN for a teaching project — the traffic never leaves a trusted network.

In a real production deployment, this should be replaced with FTPS or SFTP instead,
which encrypt the connection. This is a deliberate, documented scope decision for this
project, not an oversight.

## SMTP / Email (Stage 4)

Who gets what:

| Email | To | When |
|---|---|---|
| Order confirmed | the student's sign-up email | order placed |
| Order is ready | the student's sign-up email | kitchen marks it READY |
| Low stock alert | `MANAGER_EMAIL` | an item drops to its threshold |
| Daily sales report | `MANAGER_EMAIL` | `python manage.py send_daily_report` |

Students who left email blank simply get no mail. Which statuses email the student
is the `STUDENT_EMAIL_STATUSES` set in `notifications/emails.py`.

Everything is configured in `backend/.env` (see `.env.example`):

- **`EMAIL_HOST` empty (default):** emails are printed in the Django terminal. Nothing
  is sent, nothing errors.
- **Gmail:** `EMAIL_HOST=smtp.gmail.com`, port 587, TLS, your Gmail address as
  `EMAIL_HOST_USER`, and a Google **App Password** (not your normal password) as
  `EMAIL_HOST_PASSWORD`. Needs 2-Step Verification on that Google account.
- **MailPit / any local test server:** `EMAIL_HOST=localhost`, `EMAIL_PORT=1025`,
  `EMAIL_USE_TLS=False`.

All sending goes through `notifications/async_email.py`'s thread pool, after the
database commit. A slow, down or misconfigured mail server never delays or breaks
an order: the failure is logged as one `email not sent (...)` line and the order
carries on. Automated tests use Django's in-memory backend (`mail.outbox`).

**Without email at all**, students still see every status change live on their order
page, and get a browser notification when an order is ready or cancelled (cancellations
are not emailed; they're
asked for permission when they place an order). That works while any canteen tab is
open, and needs HTTPS or localhost: browsers block notifications on plain
`http://192.168.x.x`.
