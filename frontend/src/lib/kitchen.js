/**
 * Everything the board knows that is not simply "here are the tickets".
 *
 * All of it is derived from the same order[] the API already returns — no new
 * endpoint, no analytics backend. Pure functions, no React, no clock of their
 * own: `now` is always passed in, so every one of these is testable with a
 * fixed timestamp.
 */

import { ALL_STATUSES, columnFor } from '../api/shapes.js';
import { isLate, LATE_AFTER_MS } from './time.js';

/**
 * Every stage that still needs a pan. READY is cooked and sitting on the pass.
 *
 * Derived from columnFor rather than written out, because the backend has more
 * states than the board draws — ACCEPTED lives in the PLACED column — and a
 * hand-written list would quietly drop those tickets out of the pan list the
 * day one appeared. Work out which column a status belongs to, once.
 */
const UNCOOKED = ALL_STATUSES.filter((s) => ['PLACED', 'PREPARING'].includes(columnFor(s)));

/** Long enough for a cooked dish to sit before someone calls the number again. */
export const UNCOLLECTED_AFTER_MS = 4 * 60 * 1000;

/** The window every rate on the board is measured over. */
export const FLOW_WINDOW_MS = 10 * 60 * 1000;

/**
 * What is actually on the pans, in the order it should be cooked.
 *
 * This is the one view a column of tickets cannot give you. Nobody cooks
 * order #042 and then order #043 — they cook seven dosas, because the tawa
 * holds seven. So every uncooked ticket is melted down into dish totals, and
 * each dish carries the age of the OLDEST ticket waiting on it, which is what
 * decides what goes on the heat next.
 *
 * Sorted by that age rather than by quantity: a single dosa someone has been
 * waiting eleven minutes for outranks six that were ordered a minute ago.
 */
export function panList(orders, now) {
  const byDish = new Map();

  for (const order of orders) {
    if (!UNCOOKED.includes(order.status)) continue;
    const placedAt = new Date(order.created_at).getTime();

    for (const item of order.items) {
      const row = byDish.get(item.name);
      if (row) {
        row.qty += item.qty;
        row.tickets += 1;
        row.since = Math.min(row.since, placedAt);
      } else {
        byDish.set(item.name, { name: item.name, qty: item.qty, tickets: 1, since: placedAt });
      }
    }
  }

  return [...byDish.values()]
    .map((row) => ({ ...row, waitMs: Math.max(0, now - row.since) }))
    .sort((a, b) => b.waitMs - a.waitMs || b.qty - a.qty || a.name.localeCompare(b.name));
}

/**
 * The state of the counter in one object.
 *
 * `itemsToCook` rather than an order count, because orders are not a unit of
 * work — one ticket can be a chai and another can be four thalis.
 */
export function vitals(orders, now) {
  const counts = { PLACED: 0, PREPARING: 0, READY: 0 };
  let itemsToCook = 0;
  let oldestMs = 0;
  let late = 0;
  let uncollected = null; // the READY ticket that has sat longest

  for (const order of orders) {
    // Counted by column, so an ACCEPTED ticket shows up under New rather than
    // vanishing from the tally while still sitting on the board.
    const column = columnFor(order.status);
    if (column in counts) counts[column] += 1;

    const waitedMs = Math.max(0, now - new Date(order.created_at).getTime());

    if (column === 'READY') {
      if (!uncollected || waitedMs > uncollected.waitMs) {
        uncollected = { id: order.id, waitMs: waitedMs };
      }
      continue;
    }
    if (!UNCOOKED.includes(order.status)) continue;

    itemsToCook += order.items.reduce((sum, item) => sum + item.qty, 0);
    if (waitedMs > oldestMs) oldestMs = waitedMs;
    if (isLate(order.created_at, now)) late += 1;
  }

  return {
    counts,
    itemsToCook,
    oldestMs,
    late,
    // Only surfaced once it is worth acting on; below that it is just a dish
    // that was cooked forty seconds ago.
    uncollected: uncollected && uncollected.waitMs >= UNCOLLECTED_AFTER_MS ? uncollected : null,
  };
}

/**
 * Whether the queue is growing or shrinking — the one number that says what
 * the next twenty minutes look like. A board with fifteen tickets that is
 * clearing faster than it fills is fine; one with six that is filling is not.
 *
 * `cleared` comes from useShiftLog: tickets this board watched leave. That is
 * also why `watchedMs` is here — until the board has been open for a full
 * window, it has seen every arrival but only some of the departures, and the
 * comparison would read as a rush that is not happening. Under that, it
 * returns no verdict rather than a flattering one.
 */
export function flow(orders, cleared, now, watchedMs, windowMs = FLOW_WINDOW_MS) {
  const since = now - windowMs;
  const placedInWindow = (createdAt) => createdAt >= since;

  const arrived =
    orders.filter((o) => placedInWindow(new Date(o.created_at).getTime())).length +
    cleared.filter((c) => placedInWindow(c.createdAt)).length;

  const left = cleared.filter((c) => c.collectedAt >= since).length;

  // A one-ticket difference over ten minutes is noise, not a trend.
  const gap = arrived - left;
  const verdict =
    watchedMs < windowMs ? null : gap > 1 ? 'filling' : gap < -1 ? 'clearing' : 'steady';

  return { arrived, left, verdict };
}

/**
 * The middle ticket, not the average one. One order that sat through a power
 * cut would drag a mean far enough to make the number useless, and the
 * question staff are asking — "how long are we taking right now?" — is a
 * question about the typical ticket.
 */
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export { LATE_AFTER_MS };
