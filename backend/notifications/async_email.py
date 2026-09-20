"""
All outgoing email goes through this module instead of being sent directly inside
a request. Sending mail can be slow (or the mail server can be down entirely) --
routing every send through a background thread pool means a checkout or status
update always completes immediately for the user, regardless of email health.

During automated tests, sending happens synchronously instead. A background
thread's completion isn't guaranteed before a test's assertions run, which would
make tests flaky through no fault of the actual email logic -- this keeps tests
fast and deterministic while still exercising the exact same send functions.
"""
from concurrent.futures import ThreadPoolExecutor
import logging
import sys

logger = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4)

_RUNNING_TESTS = "test" in sys.argv


def send_async(send_fn, *args, **kwargs):
    """
    Submits send_fn(*args, **kwargs) to run in the background and returns
    immediately. Any exception inside send_fn is caught and logged here --
    a failed email must never crash the background thread or, more importantly,
    ever propagate back to break the request that triggered it.
    """
    def _wrapped():
        try:
            send_fn(*args, **kwargs)
        except Exception:
            logger.exception("Background email send failed")

    if _RUNNING_TESTS:
        _wrapped()
    else:
        _executor.submit(_wrapped)