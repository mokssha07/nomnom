import { useCallback, useEffect, useState } from 'react';

/**
 * Re-runs `fetcher` every `intervalMs` and hands back the latest result.
 *
 * Three decisions here matter, and all three exist to stop the kitchen board
 * flickering while it refreshes itself every few seconds:
 *
 * 1. `isLoading` is true for the FIRST fetch only. Later refreshes leave it
 *    false, so the page never swaps back to a spinner and throws away what
 *    the user is looking at.
 *
 * 2. A failed fetch keeps the last good `data` and only sets `error`. The
 *    canteen wifi dropping for four seconds must not blank the board — stale
 *    tickets are far better than no tickets.
 *
 * 3. setTimeout chained after each response, not setInterval. setInterval
 *    fires on a fixed schedule regardless of whether the previous request
 *    came back, so a slow network stacks up overlapping requests that can
 *    resolve out of order. Chaining guarantees one in flight at a time.
 *
 * `fetcher` must be stable across renders — pass a module-scope function or
 * one wrapped in useCallback, or the effect restarts on every render.
 *
 * Pass 0 as the interval to fetch once and stop.
 */
export function usePoll(fetcher, intervalMs) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let live = true;
    let timer;

    async function tick() {
      try {
        const next = await fetcher();
        if (!live) return;
        setData(next);
        setError(null);
      } catch (failure) {
        if (!live) return;
        setError(failure); // data deliberately untouched
      }
      if (!live) return;
      setIsLoading(false);
      // A falsy interval means "fetch once, then stop" — how a caller switches
      // polling off when the thing being watched can no longer change.
      if (intervalMs) timer = setTimeout(tick, intervalMs);
    }

    tick();

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [fetcher, intervalMs]);

  /** Applies a local change immediately, without waiting for the next poll. */
  const patch = useCallback((update) => setData(update), []);

  return { data, error, isLoading, patch };
}
