"""Django settings. Everything machine-specific comes from backend/.env (see .env.example)."""
import os
import sys
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

# The `dispatcher` package lives next to backend/, not inside it.
sys.path.insert(0, str(BASE_DIR.parent))

# DEBUG is off unless .env turns it on, so a forgotten setting fails safe.
DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError('SECRET_KEY must be set in backend/.env when DEBUG is off.')
    SECRET_KEY = 'django-insecure-dev-only-key'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

INSTALLED_APPS = [
    'daphne',
    'channels',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'accounts',
    'counters',
    'menu',
    'notifications',
    'orders',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'canteen_system.urls'
ASGI_APPLICATION = 'canteen_system.asgi.application'
WSGI_APPLICATION = 'canteen_system.wsgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

DATABASES = {'default': dj_database_url.config(default=os.environ.get('DATABASE_URL'))}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# --- API ---
# The browser only ever talks to the Vite server, which proxies /api and /ws
# here, so every request is same-origin and no CORS setup is needed.
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    # Only views that set throttle_scope are limited: login/register ('auth')
    # and placing orders ('orders').
    # ponytail: counts live in the local-memory cache, so per process. Fine for one server.
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.ScopedRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'auth': '10/min', 'orders': '30/hour'},
    # Requests arrive through exactly one proxy (Vite), which appends the real
    # client IP. Trust only that last entry. This is only safe while Django
    # listens on 127.0.0.1, so nobody can reach it without going through Vite.
    'NUM_PROXIES': 1,
}

# --- Live kitchen feed (WebSocket) ---
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

# Show bridge/dispatcher messages in the runserver terminal.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'simple': {'format': '%(levelname)s %(name)s: %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'simple'}},
    'loggers': {'orders': {'handlers': ['console'], 'level': 'INFO'}},
}

# --- Email ---
# Set EMAIL_HOST in backend/.env to send real mail (Gmail: see .env.example).
# Without it, emails are printed in the runserver terminal instead, so nothing
# breaks on a laptop with no mail server.
EMAIL_HOST = os.environ.get('EMAIL_HOST', '')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_TIMEOUT = 10   # seconds; a hung mail server must not hold a worker thread forever
EMAIL_BACKEND = (
    'django.core.mail.backends.smtp.EmailBackend' if EMAIL_HOST
    else 'django.core.mail.backends.console.EmailBackend'
)
# Gmail only sends "From" the account you log in with, so default to that.
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL') or EMAIL_HOST_USER or 'canteen@localhost'
# Who gets low-stock alerts and the daily sales report.
MANAGER_EMAIL = os.environ.get('MANAGER_EMAIL', DEFAULT_FROM_EMAIL)
