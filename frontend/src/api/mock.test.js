import assert from 'node:assert/strict';
import test from 'node:test';

/* mock.js is browser-only by design and reaches for sessionStorage bare, so it
   needs one to exist before the import. A Map is the whole of the API it uses. */
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const mock = await import('./mock.js');

await mock.login('student', 'student');

test('a retried order with the same key gives back the first order, not a second one', async () => {
  // The exact shape of a double tap on flaky wifi: same basket, same key.
  const first = await mock.placeOrder([{ id: 1, qty: 2 }], { idempotencyKey: 'k-abc' });
  const again = await mock.placeOrder([{ id: 1, qty: 2 }], { idempotencyKey: 'k-abc' });
  assert.equal(again.id, first.id, 'the kitchen must not be told to cook this twice');
});

test('a different key is a different order', async () => {
  const first = await mock.placeOrder([{ id: 1, qty: 1 }], { idempotencyKey: 'k-one' });
  const other = await mock.placeOrder([{ id: 1, qty: 1 }], { idempotencyKey: 'k-two' });
  assert.notEqual(other.id, first.id);
});

test('an order carries the counter it is collected from', async () => {
  const order = await mock.placeOrder([{ id: 1, qty: 1 }], { idempotencyKey: 'k-counter' });
  assert.equal(typeof order.counter.name, 'string');
  assert.ok(order.counter.id);
});

test('a dish that is off the menu names itself so the cart can point at the row', async () => {
  const menu = await mock.getMenu();
  const gone = { id: Math.max(...menu.map((m) => m.id)) + 99, qty: 1 };
  const error = await mock.placeOrder([gone], { idempotencyKey: 'k-gone' }).then(
    () => null,
    (e) => e,
  );
  assert.ok(error, 'ordering something off the menu must fail');
  assert.equal(error.itemId, gone.id);
});
