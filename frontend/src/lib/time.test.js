// Run with: npm test
// The only logic on the board that can be wrong without looking wrong — a
// clock that reads 8:00 instead of 9:60 still looks like a clock.

import assert from 'node:assert/strict';
import test from 'node:test';
import { elapsed, isLate, LATE_AFTER_MS } from './time.js';

const at = (ms) => new Date(ms).toISOString();

test('elapsed pads seconds and rolls into minutes', () => {
  assert.equal(elapsed(at(0), 0), '0:00');
  assert.equal(elapsed(at(0), 42_000), '0:42');
  assert.equal(elapsed(at(0), 60_000), '1:00');
  assert.equal(elapsed(at(0), 65_000), '1:05');
  // Past an hour it keeps counting in minutes rather than adding an hours
  // field — a 63-minute-old order is a problem, not a time of day.
  assert.equal(elapsed(at(0), 3_800_000), '63:20');
});

test('elapsed never goes negative when the clocks disagree', () => {
  assert.equal(elapsed(at(5_000), 0), '0:00');
});

test('isLate trips exactly on the threshold', () => {
  assert.equal(isLate(at(0), LATE_AFTER_MS - 1), false);
  assert.equal(isLate(at(0), LATE_AFTER_MS), true);
});
