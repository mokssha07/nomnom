// Run with: npm test

import assert from 'node:assert/strict';
import test from 'node:test';
import { setQty } from './cartLines.js';

test('adds a new line at the end', () => {
  assert.deepEqual(setQty([], 1, 2), [{ id: 1, qty: 2 }]);
});

test('updates a line in place, without reordering the cart', () => {
  const lines = [
    { id: 1, qty: 1 },
    { id: 2, qty: 1 },
    { id: 3, qty: 1 },
  ];
  assert.deepEqual(setQty(lines, 1, 5), [
    { id: 1, qty: 5 },
    { id: 2, qty: 1 },
    { id: 3, qty: 1 },
  ]);
});

test('qty 0 or less removes the line', () => {
  const lines = [
    { id: 1, qty: 1 },
    { id: 2, qty: 3 },
  ];
  assert.deepEqual(setQty(lines, 2, 0), [{ id: 1, qty: 1 }]);
  assert.deepEqual(setQty(lines, 2, -1), [{ id: 1, qty: 1 }]);
});

test('never mutates the array it was given', () => {
  const lines = [{ id: 1, qty: 1 }];
  setQty(lines, 1, 9);
  setQty(lines, 2, 1);
  setQty(lines, 1, 0);
  assert.deepEqual(lines, [{ id: 1, qty: 1 }]);
});
