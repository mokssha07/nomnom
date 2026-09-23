import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flow, median, panList, vitals } from './kitchen.js';

const NOW = new Date('2026-09-20T10:00:00Z').getTime();
const minsAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const WATCHED = 30 * 60_000; // the board has been open long enough to judge flow

const order = (id, status, mins, items) => ({
  id,
  status,
  total: 0,
  created_at: minsAgo(mins),
  items,
});

const dosa = (qty) => ({ name: 'Masala Dosa', qty, price: 60 });
const chai = (qty) => ({ name: 'Masala Chai', qty, price: 15 });

test('panList adds the same dish up across tickets', () => {
  const rows = panList(
    [order(1, 'PLACED', 2, [dosa(2)]), order(2, 'PREPARING', 3, [dosa(1), chai(2)])],
    NOW,
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => [r.name, r.qty, r.tickets]),
    [
      ['Masala Dosa', 3, 2],
      ['Masala Chai', 2, 1],
    ],
  );
});

test('panList ignores dishes that are already cooked', () => {
  const rows = panList([order(1, 'READY', 5, [dosa(4)]), order(2, 'PLACED', 1, [chai(1)])], NOW);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Masala Chai'],
  );
});

test('panList sorts by the oldest ticket waiting, not by quantity', () => {
  const rows = panList(
    [order(1, 'PLACED', 1, [chai(9)]), order(2, 'PLACED', 8, [dosa(1)])],
    NOW,
  );
  assert.equal(rows[0].name, 'Masala Dosa');
  assert.equal(rows[0].waitMs, 8 * 60_000);
});

test('an ACCEPTED ticket is still work on the pan', () => {
  // The state the backend added between PLACED and PREPARING. Nothing is
  // cooking yet, so it belongs in the pan list exactly as PLACED does.
  const rows = panList([order(1, 'ACCEPTED', 5, [dosa(2)])], NOW);
  assert.deepEqual(
    rows.map((r) => [r.name, r.qty]),
    [['Masala Dosa', 2]],
  );
});

test('ACCEPTED is counted in the New column, not lost between columns', () => {
  const { counts, itemsToCook } = vitals(
    [order(1, 'PLACED', 2, [chai(1)]), order(2, 'ACCEPTED', 3, [dosa(1)])],
    NOW,
  );
  assert.equal(counts.PLACED, 2, 'both tickets are waiting to be cooked');
  assert.equal(itemsToCook, 2);
});

test('vitals counts work in items, not in orders', () => {
  const v = vitals(
    [order(1, 'PLACED', 1, [dosa(2), chai(1)]), order(2, 'PREPARING', 2, [dosa(1)])],
    NOW,
  );
  assert.equal(v.itemsToCook, 4);
  assert.deepEqual(v.counts, { PLACED: 1, PREPARING: 1, READY: 0 });
});

test('vitals reports the oldest uncooked ticket and flags the late ones', () => {
  const v = vitals(
    [order(1, 'PLACED', 12, [dosa(1)]), order(2, 'PREPARING', 3, [chai(1)])],
    NOW,
  );
  assert.equal(v.oldestMs, 12 * 60_000);
  assert.equal(v.late, 1);
});

test('vitals leaves cooked dishes out of the pan workload', () => {
  const v = vitals([order(1, 'READY', 30, [dosa(5)])], NOW);
  assert.equal(v.itemsToCook, 0);
  assert.equal(v.oldestMs, 0);
  assert.equal(v.late, 0);
});

test('vitals nags about a ready ticket nobody has collected', () => {
  const v = vitals([order(42, 'READY', 6, [dosa(1)])], NOW);
  assert.equal(v.uncollected.id, 42);
});

test('vitals stays quiet about a dish that was just plated', () => {
  assert.equal(vitals([order(42, 'READY', 1, [dosa(1)])], NOW).uncollected, null);
});

test('flow counts arrivals from both the board and what has left it', () => {
  const cleared = [{ id: 9, createdAt: NOW - 6 * 60_000, collectedAt: NOW - 60_000 }];
  const f = flow([order(1, 'PLACED', 3, [chai(1)])], cleared, NOW, WATCHED);
  assert.deepEqual(f, { arrived: 2, left: 1, verdict: 'steady' });
});

test('flow ignores anything older than the window', () => {
  const cleared = [{ id: 9, createdAt: NOW - 40 * 60_000, collectedAt: NOW - 30 * 60_000 }];
  const f = flow([order(1, 'PLACED', 45, [chai(1)])], cleared, NOW, WATCHED);
  assert.deepEqual(f, { arrived: 0, left: 0, verdict: 'steady' });
});

test('flow calls it filling only once the gap is more than one ticket', () => {
  const three = [order(1, 'PLACED', 1, []), order(2, 'PLACED', 2, []), order(3, 'PLACED', 3, [])];
  assert.equal(flow(three.slice(0, 1), [], NOW, WATCHED).verdict, 'steady');
  assert.equal(flow(three, [], NOW, WATCHED).verdict, 'filling');
});

test('flow calls it clearing when more left than arrived', () => {
  const cleared = [1, 2, 3].map((id) => ({
    id,
    createdAt: NOW - 30 * 60_000, // placed before the window, collected inside it
    collectedAt: NOW - 60_000,
  }));
  assert.equal(flow([], cleared, NOW, WATCHED).verdict, 'clearing');
});

test('flow gives no verdict until it has watched a full window', () => {
  const busy = [order(1, 'PLACED', 1, []), order(2, 'PLACED', 1, []), order(3, 'PLACED', 1, [])];
  assert.equal(flow(busy, [], NOW, 2 * 60_000).verdict, null);
});

test('median takes the middle value, and averages the middle two', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.equal(median([]), null);
});
