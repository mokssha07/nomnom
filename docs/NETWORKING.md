# Networking Notes — Campus Canteen Order System

## FTP security limitation (Stage 3)

The menu upload and sales backup servers use plain FTP, which transmits credentials
and file contents unencrypted. This is acceptable only because this system runs on a
closed campus LAN for a teaching project — the traffic never leaves a trusted network.

In a real production deployment, this should be replaced with FTPS or SFTP instead,
which encrypt the connection. This is a deliberate, documented scope decision for this
project, not an oversight.

## SMTP / Email (Stage 4)

Development and testing use MailPit, a local fake SMTP server, so no real emails
are ever sent while building or testing this project. Automated tests use
Django's in-memory email backend instead (emails are captured in `mail.outbox`,
never sent anywhere at all).

To switch to a real SMTP provider for production, update these settings values
(currently pointing at MailPit):
EMAIL_HOST = 'localhost' -> your real SMTP host (e.g. smtp.gmail.com)
EMAIL_PORT = 1025 -> your provider's port (e.g. 587)
EMAIL_USE_TLS = False -> True, for most real providers
EMAIL_HOST_USER = '' -> your SMTP username
EMAIL_HOST_PASSWORD = '' -> your SMTP password / app password

All email-sending code goes through `notifications/async_email.py`'s thread pool,
so a real SMTP provider being slow or temporarily down will never delay or break
order placement -- the same protection proven in Step 4.6's failure test applies
identically to a production SMTP swap.
