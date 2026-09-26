/**
 * THE API CONTRACT — single source of truth.
 *
 * Every shape the frontend depends on lives here. When the real backend
 * disagrees, change it here first, then fix the two files that produce these
 * shapes: mock.js and real.js. No page should ever invent a field.
 *
 * These are the shapes the PAGES see. The Django backend sends something
 * different (category objects, is_orderable, string prices, total_amount,
 * menu_item/quantity/unit_price) and real.js translates. That translation is
 * the only place the two vocabularies meet — which is why adding ACCEPTED or
 * renaming a backend field never reaches a component.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * menuItem = {
 *   id:          number       // stable, used as the cart key
 *   name:        string       // "Masala Dosa"
 *   description: string       // one short line, may be ""
 *   price:       number       // rupees, plain number — NOT a string, NOT paise
 *   category:    string       // free text; pages group by exact match
 *   available:   boolean      // false = shown but not orderable
 *   image:       string|null  // absolute URL from the backend, or null
 *   counter:     counter      // which window cooks it
 * }
 *
 * counter = {
 *   id:   number
 *   name: string              // "Main Kitchen"
 * }
 *
 * order = {
 *   id:         number        // small int, shown as a token number: #042
 *   status:     OrderStatus   // see below
 *   total:      number        // rupees; backend computes it, we never trust ours
 *   created_at: string        // ISO 8601, e.g. "2026-09-19T10:24:05Z"
 *   counter:    counter       // where to collect it
 *   items:      orderItem[]
 * }
 *
 * orderItem = {
 *   name:  string             // snapshot of the name AT ORDER TIME
 *   qty:   number
 *   price: number             // per-unit price AT ORDER TIME, not today's price
 * }
 *
 * user = {
 *   id:       number
 *   username: string
 *   role:     "student" | "staff" | "manager"
 * }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CALLS
 *
 * login(username, password)  -> user      // response also carries the auth
 *                                         // token; real.js keeps it and
 *                                         // strips it before returning
 * register(details)          -> user      // { username, password, roll_number,
 *                                         // email, phone_number }; always a
 *                                         // student. The backend does not
 *                                         // return a token here, so real.js
 *                                         // registers then logs straight in.
 * getMe()                    -> user | null   // null when not signed in
 * logout()                   -> void
 * getMenu()                  -> menuItem[]
 * placeOrder(items, opts)    -> order     // items: [{ id, qty }] — menuItem ids
 *                                         // opts: { counterId, idempotencyKey }
 * getOrders()                -> order[]   // student: own orders, newest first
 *                                         // staff/manager: all ACTIVE orders
 * getOrder(id)               -> order
 * setStatus(id, status)      -> order     // the updated order
 * cancelOrder(id)            -> order     // student, PLACED only
 *
 * Errors: every call rejects with an Error whose .message is safe to show to
 * a user, and .status carrying the HTTP status when there is one.
 *
 * A rejected placeOrder may also carry .itemId — the one menu item that was
 * out of stock — so the cart can point at the offending row instead of
 * emptying itself.
 */

/**
 * The happy path, in the exact order an order moves through it.
 *
 * CANCELLED is deliberately NOT in this list: it is a way off the line, not a
 * point along it, and every "how far along am I" calculation here is an index
 * into this array. Keeping it out means those stay honest.
 */
export const STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

/** Every status the backend can send, including the one off the line. */
export const ALL_STATUSES = [...STATUSES, 'CANCELLED'];

/** Human labels. The kitchen board and the student pages read differently. */
export const STATUS_LABELS = {
  PLACED: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Columns on the kitchen board, left to right. */
export const BOARD_COLUMNS = ['PLACED', 'PREPARING', 'READY'];

/**
 * Which board column a status is drawn in — null means it has left the board.
 *
 * ACCEPTED shares the PLACED column on purpose. The backend needs the extra
 * state so it can record that a human saw the order; the cook looking at the
 * board does not, because "seen but not started" and "not started" are the
 * same pile of work. Folding it keeps three readable columns on a phone
 * instead of four cramped ones, and the first tap still advances the order.
 */
const COLUMN_FOR = {
  PLACED: 'PLACED',
  ACCEPTED: 'PLACED',
  PREPARING: 'PREPARING',
  READY: 'READY',
};

export function columnFor(status) {
  return COLUMN_FOR[status] ?? null;
}

/**
 * Only the orders that still have a column. A ticket tapped "Collected" is
 * COMPLETED locally before the next refetch drops it, and drawing it with no
 * column crashed the whole board.
 */
export function onBoard(orders) {
  return orders.filter((order) => columnFor(order.status) !== null);
}

/** What one tap on a kitchen card does. null = nothing further to advance to. */
export function nextStatus(status) {
  const i = STATUSES.indexOf(status);
  return i === -1 || i === STATUSES.length - 1 ? null : STATUSES[i + 1];
}

/** Students may cancel only before the kitchen has acknowledged the order. */
export function canCancel(status) {
  return status === 'PLACED';
}

/** Nothing more will happen to this order — stop polling it. */
export function isFinished(status) {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export const ROLES = ['student', 'staff', 'manager'];

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE = {
  student: '/menu',
  staff: '/kitchen',
  manager: '/kitchen',
};
