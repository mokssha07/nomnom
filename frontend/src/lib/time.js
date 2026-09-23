/** How long an order can sit before the board flags it. */
export const LATE_AFTER_MS = 10 * 60 * 1000;

/**
 * "0:42", "7:05", "63:20" — a plain duration in minutes and seconds.
 *
 * Clamped at zero because a clock skew between the server and the browser
 * would otherwise render "-1:-3".
 */
export function duration(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The same thing, measured from when an order was placed.
 *
 * Deliberately not "7 minutes ago". Kitchen staff are comparing tickets
 * against each other at a glance, and a counter that visibly moves every
 * second also tells them the board is alive without needing a status light.
 */
export function elapsed(createdAt, now) {
  return duration(now - new Date(createdAt).getTime());
}

/** True once an order has been waiting long enough to need chasing. */
export function isLate(createdAt, now) {
  return now - new Date(createdAt).getTime() >= LATE_AFTER_MS;
}
