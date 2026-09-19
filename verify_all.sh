#!/bin/bash
# Pre-commit verification for canteen-project.
# Run from the project root:  bash verify_all.sh
# Changes nothing. Prints PASS / FAIL / WARN per check and a summary at the end.

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

PASS=0; FAIL=0; WARN=0
pass() { echo "  PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
warn() { echo "  WARN  $1"; WARN=$((WARN+1)); }

echo "== 1. Dispatcher unit tests =="
OUT=$(python -m unittest dispatcher.test_queue_status dispatcher.test_discovery \
      dispatcher.test_server dispatcher.test_protocol 2>&1)
echo "$OUT" | tail -4
if echo "$OUT" | grep -q "^OK"; then pass "dispatcher tests ($(echo "$OUT" | grep -o 'Ran [0-9]* tests'))"; else fail "dispatcher tests"; fi

echo
echo "== 2. Django checks =="
cd "$ROOT/backend" || exit 1
if [ -f venv/bin/activate ]; then source venv/bin/activate; else warn "backend/venv not found, using current python"; fi

if python manage.py check 2>&1 | tail -2 | grep -q "no issues"; then pass "manage.py check"; else fail "manage.py check"; fi

MIG=$(python manage.py makemigrations --check --dry-run 2>&1)
if echo "$MIG" | grep -q "No changes detected"; then pass "no missing migrations"; else fail "model changes without a migration:"; echo "$MIG" | sed 's/^/        /'; fi

UNAPPLIED=$(python manage.py showmigrations 2>&1 | grep -c "\[ \]")
if [ "$UNAPPLIED" = "0" ]; then pass "all migrations applied"; else warn "$UNAPPLIED unapplied migration(s) in your dev DB"; fi

TESTOUT=$(python manage.py test 2>&1)
echo "$TESTOUT" | tail -4
if echo "$TESTOUT" | grep -q "^OK"; then pass "django test suite"
elif echo "$TESTOUT" | grep -q "Ran 0 tests"; then warn "django found 0 tests in backend/"
else fail "django test suite"; fi

echo
echo "== 3. Dependencies =="
for pkg in django djangorestframework channels daphne websockets Pillow; do
  if grep -qi "^$pkg\b" requirements.txt 2>/dev/null; then pass "requirements.txt lists $pkg"
  else fail "requirements.txt is missing $pkg"; fi
done
if grep -qi "^django==" requirements.txt 2>/dev/null; then pass "versions are pinned"; else warn "requirements.txt versions are not pinned (use: pip freeze > requirements.txt)"; fi

echo
echo "== 4. Settings hygiene =="
if grep -q "^ALLOWED_HOSTS *= *\[\]" canteen_system/settings.py; then warn "ALLOWED_HOSTS is empty (other devices on the Wi-Fi will be refused)"; else pass "ALLOWED_HOSTS is set"; fi
if grep -q "^SECRET_KEY *= *['\"]" canteen_system/settings.py; then warn "SECRET_KEY is hardcoded in settings.py (fine for a private repo, not for a public one)"; else pass "SECRET_KEY is not hardcoded"; fi
if grep -q "^DEBUG *= *True" canteen_system/settings.py; then warn "DEBUG = True (fine for development)"; fi

echo
echo "== 5. Git hygiene =="
cd "$ROOT" || exit 1
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  warn "not a git repo yet (run: git init)"
else
  for pat in "venv" "db.sqlite3" "__pycache__" ".env" "media"; do
    if grep -q "$pat" .gitignore 2>/dev/null; then pass ".gitignore covers $pat"; else fail ".gitignore does not cover $pat"; fi
  done
  BAD=$(git ls-files | grep -E "(^|/)(venv/|db\.sqlite3$|\.env$|__pycache__/|\.pyc$)" | head -5)
  if [ -z "$BAD" ]; then pass "no venv / database / cache files are tracked"; else fail "these should not be tracked:"; echo "$BAD" | sed 's/^/        /'; fi
  echo "  Files git would commit now:"
  git status --short | head -40 | sed 's/^/        /'
fi

echo
echo "== Summary: $PASS passed, $FAIL failed, $WARN warnings =="
[ "$FAIL" = "0" ] && echo "Safe to commit once you have read the warnings." || echo "Fix the FAIL lines before committing."
