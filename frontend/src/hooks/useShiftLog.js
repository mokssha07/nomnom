import { useEffect, useRef, useState } from 'react';

/**
 * The board's memory of its own shift.
 *
 * getOrders() only ever returns ACTIVE orders, so the API alone can tell the
 * kitchen what is happening now and nothing at all about how the morning is
 * going. Rather than invent an endpoint the backend does not have, this
 * watches the list it already polls and writes down what changes:
 *
 *   • a ticket that has vanished was collected — that is the only way off the
 *     board, so a disappearance is a completion
 *   • a ticket seen at READY for the first time was just cooked, so the gap
 *     back to created_at is how long that order took
 *
 * Both are accurate to one poll (four seconds), which is far finer than the
 * numbers built on them are ever read to.
 *
 * The log starts empty on every load, which is honest rather than unfortunate:
 * `watchedMs` is returned so the page can say how much it has actually seen
 * instead of presenting a half-hour of history it does not have.
 */
export function useShiftLog(orders) {
  // A ref, not state: writing to it must not itself cause the render that
  // writes to it again. The snapshot below is what the page renders.
  const log = useRef({ open: new Map(), cleared: [], preps: [], startedAt: Date.now() });
  const [snapshot, setSnapshot] = useState(() => ({
    cleared: [],
    preps: [],
    startedAt: log.current.startedAt,
  }));

  useEffect(() => {
    // A failed poll leaves `orders` untouched, so this effect does not run and
    // no ticket is wrongly recorded as collected during an outage.
    if (!orders) return;

    const now = Date.now();
    const { open, cleared, preps } = log.current;
    const live = new Set();

    for (const order of orders) {
      live.add(order.id);
      const record = open.get(order.id) ?? {
        createdAt: new Date(order.created_at).getTime(),
        cookedAt: null,
      };
      if (!record.cookedAt && order.status === 'READY') {
        record.cookedAt = now;
        preps.push(now - record.createdAt);
      }
      open.set(order.id, record);
    }

    for (const [id, record] of open) {
      if (live.has(id)) continue;
      open.delete(id);
      cleared.push({ id, createdAt: record.createdAt, collectedAt: now });
    }

    // Fresh arrays so React sees a change; both are dozens of entries over a
    // whole service, not something worth optimising.
    setSnapshot({ cleared: [...cleared], preps: [...preps], startedAt: log.current.startedAt });
  }, [orders]);

  return snapshot;
}
