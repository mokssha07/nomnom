import assert from 'node:assert/strict';
import test from 'node:test';

/* real.js reads sessionStorage the moment it is imported, so the stub has to be
   in place before the import. A Map is the whole of the Storage API we use. */
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { adopt, httpError, placeOrder, toMenuItem, toOrder, toOrderItem, unwrap } =
  await import('./real.js');

const TOKEN_KEY = 'canteen.token';
const USER_KEY = 'canteen.user';

// ── sign-in ───────────────────────────────────────────────────────────────

test('adopt keeps the token and rebuilds the user the backend does not send', () => {
  // What the Django backend actually returns: no username anywhere.
  const me = adopt({ token: 'abc123', role: 'student', user_id: 7 }, 'nihar');
  assert.deepEqual(me, { id: 7, username: 'nihar', role: 'student' });
  assert.equal(store.get(TOKEN_KEY), 'abc123');
  assert.deepEqual(JSON.parse(store.get(USER_KEY)), me);
});

test("adopt accepts dj-rest-auth's key and a nested user", () => {
  const me = adopt({ key: 'def456', user: { id: 2, username: 'kitchen', role: 'staff' } });
  assert.deepEqual(me, { id: 2, username: 'kitchen', role: 'staff' });
  assert.equal(store.get(TOKEN_KEY), 'def456');
});

test('the token never travels on to the caller', () => {
  const me = adopt({ token: 'ghi789', role: 'student', user_id: 1, password_hash: 'nope' }, 'a');
  assert.deepEqual(Object.keys(me).sort(), ['id', 'role', 'username']);
});

test('a response with no token fails loudly instead of half-signing-in', () => {
  store.set(TOKEN_KEY, 'previous');
  assert.throws(() => adopt({ role: 'student', user_id: 1 }, 'a'), /did not send a token/);
  assert.equal(store.get(TOKEN_KEY), 'previous', 'a bad response must not clobber a good token');
});

test('a response with no role fails too — role decides which home page you land on', () => {
  assert.throws(() => adopt({ token: 'abc', user_id: 1 }, 'a'), /what kind of account/);
});

// ── menu translation ──────────────────────────────────────────────────────

test('a Django menu item becomes the shape the pages are written against', () => {
  const item = toMenuItem({
    id: 12,
    name: 'Chole Bhature',
    description: 'Spiced chickpeas',
    price: '80.00', // a string, so Django never loses a paisa to a float
    category: { id: 2, name: 'Meals', display_order: 1 },
    is_available: true,
    is_orderable: false,
    image: 'http://localhost:8000/media/chole.jpg',
    counter: { id: 1, name: 'Main Kitchen' },
  });

  assert.deepEqual(item, {
    id: 12,
    name: 'Chole Bhature',
    description: 'Spiced chickpeas',
    price: 80, // number, not "80.00"
    category: 'Meals', // string, not the object
    available: false, // is_orderable wins over is_available
    image: 'http://localhost:8000/media/chole.jpg',
    counter: { id: 1, name: 'Main Kitchen' },
  });
});

test('price arrives as a string and must never stay one', () => {
  // "80.00" + 20 is "80.0020" if this regresses, and the bill would be wrong.
  assert.equal(toMenuItem({ price: '80.00' }).price + 20, 100);
});

test('a missing description or category does not produce "undefined" on screen', () => {
  const item = toMenuItem({ id: 1, name: 'Chai' });
  assert.equal(item.description, '');
  assert.equal(item.category, 'Other');
  assert.equal(item.available, true);
  assert.equal(item.image, null);
});

// ── order translation ─────────────────────────────────────────────────────

test('a Django order becomes the shape the receipt is written against', () => {
  const order = toOrder({
    id: 42,
    status: 'ACCEPTED',
    total_amount: '145.50',
    created_at: '2026-09-21T10:24:05Z',
    counter: { id: 1, name: 'Main Kitchen' },
    items: [{ menu_item: 'Masala Dosa', quantity: 2, unit_price: '60.00' }],
  });

  assert.equal(order.total, 145.5);
  assert.deepEqual(order.items, [{ name: 'Masala Dosa', qty: 2, price: 60 }]);
  assert.deepEqual(order.counter, { id: 1, name: 'Main Kitchen' });
});

test('an order line is a dish name and a string price, as the serializer sends it', () => {
  // Confirmed against OrderItemSerializer: menu_item is
  // CharField(source='menu_item.name', read_only=True) — a name, never an
  // object and never an id.
  const line = toOrderItem({ menu_item: 'Veg Thali', quantity: 2, unit_price: '70.00' });
  assert.deepEqual(line, { name: 'Veg Thali', qty: 2, price: 70 });
});

test('a line with nothing usable still renders as text, not undefined', () => {
  for (const raw of [{}, { menu_item: null }]) {
    assert.equal(typeof toOrderItem(raw).name, 'string');
    assert.equal(toOrderItem(raw).qty, 1);
  }
});

// ── envelopes and errors ──────────────────────────────────────────────────

test('a paginated list reads the same as a bare one', () => {
  assert.deepEqual(unwrap([1, 2]), [1, 2]);
  assert.deepEqual(unwrap({ count: 2, next: null, results: [1, 2] }), [1, 2]);
  assert.deepEqual(unwrap(null), []);
});

test('a DRF serializer error surfaces the message and the field to blame', () => {
  const error = httpError({ roll_number: ['A user with that roll number exists.'] }, 400);
  assert.equal(error.message, 'A user with that roll number exists.');
  assert.equal(error.field, 'roll_number');
});

test('a stock failure names the cart row so the basket need not be thrown away', () => {
  // The real body, verbatim from the view: a 400, not a 409.
  const error = httpError(
    { error: 'insufficient_stock', detail: 'Samosa is out of stock.', item_id: 21 },
    400,
  );
  assert.equal(error.message, 'Samosa is out of stock.');
  assert.equal(error.itemId, 21);
  // item_id is a cart row, not a form input — it must never be mistaken for
  // a field to paint red on the register form.
  assert.equal(error.field, undefined);
});

test('an unreadable error body still yields something safe to show a student', () => {
  assert.equal(httpError(null, 500).message, 'Something went wrong. Try again.');
});

// ── what actually goes on the wire ────────────────────────────────────────

test('placeOrder sends counter_id, not counter', () => {
  // The one asymmetry in the whole API: the backend WRITES counter_id and
  // READS back a nested counter object. Sending `counter` is accepted with a
  // 201 and silently files the order against no counter at all, which is why
  // this is pinned by a test rather than trusted to a comment.
  let sent;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, status: 201, json: async () => ({ id: 1, items: [] }) };
  };

  return placeOrder([{ id: 4, qty: 2 }], { counterId: 3, idempotencyKey: 'k1' })
    .then(() => {
      assert.equal(sent.counter_id, 3);
      assert.equal(sent.counter, undefined);
      assert.equal(sent.idempotency_key, 'k1');
      assert.deepEqual(sent.items, [{ menu_item: 4, quantity: 2 }]);
    })
    .finally(() => {
      globalThis.fetch = realFetch;
    });
});
