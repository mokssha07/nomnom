/**
 * The real HTTP client. Not used until USE_MOCK in index.js is flipped to false.
 *
 * Two jobs, and they are worth naming separately:
 *
 *   1. Talk to Django over HTTP with a token on every request.
 *   2. TRANSLATE. The backend speaks its own vocabulary — category objects,
 *      is_orderable, string prices, total_amount, menu_item/quantity/unit_price
 *      — and the pages speak shapes.js. Every mapper below turns one into the
 *      other. This file is the only place the two vocabularies meet.
 *
 * That second job is why the backend renaming a field, or adding a status,
 * has never reached a component. Pages import from ./index, not from fetch.
 *
 * All requests go to /api, which the Vite dev server proxies to localhost:8000.
 */

import { canCancel } from './shapes.js';

const BASE = '/api';

/* Where the credential lives between reloads.
   sessionStorage rather than localStorage: it dies with the tab, which matches
   how the mock behaves and stops a shared lab machine staying signed in.

   Worth saying out loud rather than hiding: any token the page's own JavaScript
   can read, injected JavaScript can read too. An HttpOnly cookie is the one
   place a credential is out of XSS's reach, and a header scheme gives that up
   by definition — that is the cost of the backend's choice, not a bug here.
   Keeping it in sessionStorage keeps the blast radius to one tab. */
const TOKEN_KEY = 'canteen.token';

/* The backend has no /auth/me/, so the only record of who is signed in is the
   one we keep. Parked next to the token and thrown away with it, so the two
   can never disagree about whether there is a session. */
const USER_KEY = 'canteen.user';

let token = globalThis.sessionStorage?.getItem(TOKEN_KEY) ?? null;
let user = readUser();

function readUser() {
  try {
    return JSON.parse(globalThis.sessionStorage?.getItem(USER_KEY) ?? 'null');
  } catch {
    return null; // corrupted entry is the same as no session
  }
}

function setSession(nextToken, nextUser) {
  token = nextToken ?? null;
  user = nextUser ?? null;
  const store = globalThis.sessionStorage;
  if (!store) return;
  if (token) store.setItem(TOKEN_KEY, token);
  else store.removeItem(TOKEN_KEY);
  if (user) store.setItem(USER_KEY, JSON.stringify(user));
  else store.removeItem(USER_KEY);
}

/** On every request now, not just writes — the header IS the credential.
 *  A cross-site form can make the browser send a cookie; it cannot make it
 *  send this header, so the attack CSRF exists to stop does not apply. */
function authHeaders() {
  return token ? { Authorization: `Token ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network-level failure: no response at all.
    const error = new Error('Cannot reach the canteen server.');
    error.status = 0;
    throw error;
  }

  if (response.status === 204) return undefined;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // A 401 means the server has forgotten our token, so we forget it too —
    // otherwise the app sits there looking signed in and failing every call.
    if (response.status === 401) setSession(null, null);
    throw httpError(payload, response.status);
  }
  return payload;
}

/**
 * Turn a DRF error body into an Error a page can show.
 *
 * DRF puts the message in half a dozen places depending on whether it came
 * from a serializer, a permission class or a raised APIException, and a
 * student staring at "[object Object]" learns nothing. Worth the ten lines.
 */
export function httpError(payload, status) {
  const first =
    payload?.detail ??
    payload?.error ??
    payload?.message ??
    // serializer errors: { roll_number: ["already exists"] }
    (payload && typeof payload === 'object'
      ? Object.values(payload).flat().find((v) => typeof v === 'string')
      : null);

  const error = new Error(first || 'Something went wrong. Try again.');
  error.status = status;
  // Which form field to point at, when the backend says.
  if (payload && typeof payload === 'object') {
    const field = Object.keys(payload).find(
      (k) => !['detail', 'error', 'message', 'error_code', 'item_id'].includes(k),
    );
    if (field) error.field = field;
    // Which cart row went out of stock. This arrives as a 400, NOT a 409 —
    // `{ error: 'insufficient_stock', detail, item_id }` — so nothing may key
    // off the status code here; item_id being present is the whole signal.
    if (typeof payload.item_id === 'number') error.itemId = payload.item_id;
  }
  return error;
}

/**
 * DRF turns pagination on per-view, and a paginated list arrives as
 * { count, next, results } instead of a bare array. Unwrapping both means the
 * app does not break the day someone adds a page_size setting.
 */
export function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

// ── translation ───────────────────────────────────────────────────────────
//
// The mappers below are exported only so the test beside this file can drive
// them directly. Pages import the default from ./index and never see them.

/** Django sends money as a string ("70.00") so it never loses a paisa to a
 *  float. We render with our own formatter, which wants a number. */
const money = (value) => Number(value ?? 0);

function toCounter(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') return { id: raw, name: 'Main Kitchen' };
  return { id: raw.id, name: raw.name ?? 'Main Kitchen' };
}

export function toMenuItem(raw) {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    price: money(raw.price),
    // category arrives as { id, name, display_order }; pages group on a string.
    category: raw.category?.name ?? raw.category ?? 'Other',
    // Two separate backend flags. is_available is "do we stock it at all",
    // is_orderable is "can it be ordered right now" — the second is the one
    // that should grey out the Add button, so it is the one we map.
    available: raw.is_orderable ?? raw.is_available ?? true,
    image: raw.image ?? null,
    counter: toCounter(raw.counter ?? raw.counter_id),
  };
}

/**
 * One line of an order: { menu_item: "Veg Thali", quantity: 2, unit_price: "70.00" }.
 *
 * `menu_item` is the dish NAME, not an object and not an id — the serializer
 * declares it `CharField(source='menu_item.name', read_only=True)`, so the id
 * never comes back on an order line at all. That is why the cart's
 * out-of-stock error has to carry `item_id` separately: there is no id here to
 * match a row against.
 */
export function toOrderItem(raw) {
  return {
    name: raw.menu_item ?? raw.name ?? 'Item',
    qty: raw.quantity ?? raw.qty ?? 1,
    price: money(raw.unit_price ?? raw.price),
  };
}

export function toOrder(raw) {
  return {
    id: raw.id,
    status: raw.status,
    total: money(raw.total_amount ?? raw.total),
    created_at: raw.created_at ?? raw.created ?? new Date().toISOString(),
    counter: toCounter(raw.counter),
    items: (raw.items ?? raw.order_items ?? []).map(toOrderItem),
  };
}

// ── auth ──────────────────────────────────────────────────────────────────

/**
 * Take a sign-in response, keep the token, hand back the plain `user` the rest
 * of the app is written against.
 *
 * The backend sends { token, role, user_id } and no username — so we use the
 * one the student just typed. It is the same string that authenticated, and a
 * round-trip to fetch it back would be a request to learn something we already
 * know. Tolerant about where the token sits because that envelope still is not
 * pinned down: DRF's own view returns { token }, dj-rest-auth returns { key }.
 *
 * The two throws are the point of this function. `token` is on every later
 * request and `role` decides which home page you land on — a missing role
 * would quietly send a student to the kitchen board. Better to fail at sign-in
 * than to half-succeed and be debugged on integration day.
 *
 * Exported for the test beside this file; nothing else should call it.
 */
export function adopt(payload, username) {
  const key = payload?.token ?? payload?.key ?? payload?.auth_token;
  if (!key) throw new Error('Signed in, but the server did not send a token.');

  const nested = payload.user ?? payload;
  const role = payload.role ?? nested?.role;
  if (!role) throw new Error('Signed in, but the server did not say what kind of account this is.');

  const me = {
    id: payload.user_id ?? nested?.id ?? null,
    username: username ?? nested?.username ?? '',
    role,
  };
  setSession(key, me);
  // Only the three fields shapes.js promises. The token deliberately does not
  // travel on into React state — one copy, in one place.
  return me;
}

export const login = async (username, password) =>
  adopt(await request('/auth/login/', { method: 'POST', body: { username, password } }), username);

/**
 * The backend registers and logs in as two separate steps by design — the
 * register response carries no token — so we do both and the page never knows.
 * details: { username, password, roll_number, email, phone_number }
 */
export async function register(details) {
  // The response carries a token, so no second request (and no second
  // password hash on the server) just to sign in.
  return adopt(await request('/auth/register/', { method: 'POST', body: details }), details.username);
}

/**
 * There is no /auth/me/ on the backend, so there is nothing to ask.
 *
 * We trust the session we stored until a request comes back 401, at which
 * point request() clears it. That is the same guarantee /auth/me/ would give
 * — a stale token is discovered on first use either way — minus one round
 * trip on every page load.
 * ponytail: swap in a real /auth/me/ call here if the backend adds one.
 */
export const getMe = () => Promise.resolve(user);

/** Deletes the token on the server too, so a copied token stops working.
 *  Signing out still succeeds locally if that request fails (e.g. offline). */
export const logout = async () => {
  await request('/auth/logout/', { method: 'POST' }).catch(() => {});
  setSession(null, null);
};

// ── menu ──────────────────────────────────────────────────────────────────

/**
 * One request, not two. The items endpoint nests the whole category object —
 * including display_order — so /menu/categories/ would only tell us what we
 * are already holding. Sorting here means Menu.jsx groups in the canteen's
 * own order without knowing that display_order exists.
 */
export async function getMenu() {
  const items = unwrap(await request('/menu/items/')).map((raw) => ({
    raw,
    item: toMenuItem(raw),
  }));

  items.sort(
    (a, b) =>
      (a.raw.category?.display_order ?? 0) - (b.raw.category?.display_order ?? 0) ||
      a.item.name.localeCompare(b.item.name),
  );
  return items.map((entry) => entry.item);
}

// ── orders ────────────────────────────────────────────────────────────────

/**
 * items: [{ id, qty }] — menuItem ids.
 * opts:  { counterId, idempotencyKey }
 *
 * The idempotency key is generated by the cart page, not here, and that is
 * deliberate: it has to survive a failed attempt and be reused on retry, so it
 * belongs to the checkout the student is in the middle of, not to one call.
 */
export const placeOrder = (items, { counterId, idempotencyKey } = {}) =>
  request('/orders/', {
    method: 'POST',
    body: {
      // counter_id on the way in, `counter` on the way back out as a nested
      // { id, name } — the backend is deliberately asymmetric here, so the
      // write key and the read key are genuinely different names.
      counter_id: counterId,
      idempotency_key: idempotencyKey,
      items: items.map(({ id, qty }) => ({ menu_item_id: id, quantity: qty })),
    },
  }).then(toOrder);

/**
 * Students get their own orders; the backend scopes that itself.
 *
 * Staff get the board, which needs an explicit filter — without it a busy
 * lunch service would ship every completed order of the day to a screen that
 * only ever draws three columns. READY must be in it: that is the board's
 * third column, and the only place a cook can mark an order collected.
 */
export async function getOrders() {
  const query = user && user.role !== 'student' ? '?status=PLACED,ACCEPTED,PREPARING,READY' : '';
  return unwrap(await request(`/orders/${query}`)).map(toOrder);
}

export const getOrder = (id) => request(`/orders/${id}/`).then(toOrder);

export const setStatus = (id, status) =>
  request(`/orders/${id}/status/`, { method: 'PATCH', body: { status } }).then(toOrder);

/**
 * Cancel is a DELETE, but the order is not deleted — it comes back CANCELLED.
 * Checking here as well as in the UI because the button being hidden is a
 * courtesy, not a guarantee: a stale page can still hold a cancel button for
 * an order the kitchen accepted two seconds ago.
 */
export async function cancelOrder(id) {
  const current = await getOrder(id);
  if (!canCancel(current.status)) {
    const error = new Error('The kitchen has already started this order.');
    error.status = 409;
    throw error;
  }
  const payload = await request(`/orders/${id}/`, { method: 'DELETE' });
  // A 204 means it worked but says nothing; re-read so the page gets an order.
  return payload ? toOrder(payload) : getOrder(id);
}

// ── live kitchen feed ─────────────────────────────────────────────────────

/**
 * Calls onEvent for every order event the server pushes. Returns a function
 * that closes the socket. Reconnects every few seconds if the connection
 * drops, so a backend restart doesn't leave the board deaf.
 *
 * Browsers can't put headers on a WebSocket, so the token rides in the URL.
 */
export function subscribeKitchen(onEvent) {
  let socket;
  let retry;
  let closed = false;

  function open() {
    if (closed || !token) return;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws/kitchen/?token=${encodeURIComponent(token)}`);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data);
        if (event.type !== 'hello') onEvent(event);
      } catch {
        // not JSON: ignore it, the poll still keeps the board right
      }
    };
    socket.onclose = () => {
      if (!closed) retry = setTimeout(open, 3000);
    };
  }

  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    socket?.close();
  };
}
