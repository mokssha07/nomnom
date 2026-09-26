import assert from 'node:assert/strict';
import test from 'node:test';

import { STATUSES, canCancel, columnFor, isFinished, nextStatus, onBoard } from './shapes.js';

test('the advance chain matches the backend flow exactly', () => {
  const walked = ['PLACED'];
  let s = 'PLACED';
  while ((s = nextStatus(s))) walked.push(s);
  assert.deepEqual(walked, ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']);
});

test('COMPLETED and CANCELLED advance nowhere', () => {
  assert.equal(nextStatus('COMPLETED'), null);
  assert.equal(nextStatus('CANCELLED'), null);
});

test('ACCEPTED shares the PLACED column, finished orders leave the board', () => {
  assert.equal(columnFor('ACCEPTED'), 'PLACED');
  assert.equal(columnFor('PLACED'), 'PLACED');
  assert.equal(columnFor('COMPLETED'), null);
  assert.equal(columnFor('CANCELLED'), null);
});

test('cancel is offered only before the kitchen has acknowledged it', () => {
  assert.equal(canCancel('PLACED'), true);
  for (const s of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) {
    assert.equal(canCancel(s), false, `${s} should not be cancellable`);
  }
});

test('polling stops exactly on the two terminal states', () => {
  assert.deepEqual(
    [...STATUSES, 'CANCELLED'].filter(isFinished),
    ['COMPLETED', 'CANCELLED'],
  );
});

test('CANCELLED is off the line, so progress maths cannot land on it', () => {
  assert.equal(STATUSES.includes('CANCELLED'), false);
});

test('onBoard drops orders that have left the board, so a just-collected ticket is not drawn', () => {
  const orders = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'].map((status, id) => ({ id, status }));
  assert.deepEqual(onBoard(orders).map((o) => o.status), ['PLACED', 'ACCEPTED', 'PREPARING', 'READY']);
});
