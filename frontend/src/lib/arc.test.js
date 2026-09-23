import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REACH, arcAt } from './arc.js';

test('the middle of the rail is the top of the arc', () => {
  const middle = arcAt(0);
  assert.equal(middle.lift, 0);
  assert.equal(middle.tilt, 0);
  assert.equal(middle.fade, 1);
});

test('both sides drop by the same amount', () => {
  assert.equal(arcAt(-0.5).lift, arcAt(0.5).lift);
  assert.equal(arcAt(-0.5).fade, arcAt(0.5).fade);
});

test('the two sides tilt opposite ways', () => {
  assert.equal(arcAt(-0.5).tilt, -arcAt(0.5).tilt);
});

test('the curve is a parabola, not a ramp', () => {
  // Twice as far from the middle is four times the drop. If this ever comes
  // back as 2, someone has dropped the squaring and the rail is a slope.
  assert.equal(arcAt(0.4).lift / arcAt(0.2).lift, 4);
});

test('a photo far off screen is clamped instead of flung down the page', () => {
  assert.equal(arcAt(12).lift, arcAt(REACH).lift);
  assert.equal(arcAt(-12).tilt, -REACH);
});

test('nothing ever fades all the way out', () => {
  assert.ok(arcAt(99).fade >= 0.32);
});

test('the middle photo is full size and the others recede evenly', () => {
  assert.equal(arcAt(0).scale, 1);
  assert.equal(arcAt(-0.5).scale, arcAt(0.5).scale);
  assert.ok(arcAt(0.5).scale < 1);
});

test('a photo never shrinks to nothing, however far out it is', () => {
  // Clamped by REACH like everything else. A negative scale would flip the
  // photo inside out, which is the failure this guards.
  assert.equal(arcAt(99).scale, arcAt(REACH).scale);
  assert.ok(arcAt(99).scale > 0.5);
});
