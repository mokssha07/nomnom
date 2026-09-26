import { useEffect, useRef } from 'react';
import api from '../api';
import { useAuth } from '../auth';
import { usePoll } from '../hooks/usePoll';
import { token } from '../lib/token';

const POLL_MS = 10000;
const ALERT = {
  READY: 'is ready! Collect it at the counter.',
  CANCELLED: 'was cancelled.',
};

/**
 * The no-email fallback: a browser notification when one of your orders turns
 * READY or CANCELLED. Works while any canteen tab is open, even in the
 * background, and needs nothing from the server beyond the list it already has.
 *
 * ponytail: polls, and only while a tab is open. Web Push (service worker +
 * VAPID keys) is the upgrade if alerts must reach a closed browser.
 */
export default function OrderAlerts() {
  const { user } = useAuth();
  return user?.role === 'student' ? <Watcher /> : null;
}

function Watcher() {
  const { data: orders } = usePoll(api.getOrders, POLL_MS);
  const seen = useRef(null);

  useEffect(() => {
    if (!orders) return;
    const before = seen.current;
    seen.current = new Map(orders.map((o) => [o.id, o.status]));
    // First look only records where things stand: no alerts for old orders.
    if (!before || globalThis.Notification?.permission !== 'granted') return;
    for (const order of orders) {
      if (ALERT[order.status] && before.get(order.id) !== order.status) {
        new Notification(`Order #${token(order.id)} ${ALERT[order.status]}`);
      }
    }
  }, [orders]);

  return null;
}
