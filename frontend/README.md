# Campus Canteen — frontend

Ordering app for a college canteen. Students browse the menu and order from
their phones; kitchen staff work a wall-mounted display that updates live.

Built with React + Vite. No UI framework, no CSS framework — plain CSS with
custom properties, so every rule in the app is one you can read and explain.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

The app ships with a fake backend switched on, so it runs with nothing else
installed. Demo sign-ins: `student/student`, `kitchen/kitchen`,
`manager/manager`. The demo student holds roll number `21CS001`, so registering
with that number shows the inline duplicate-field error.

## Build it

```bash
npm run build     # output lands in dist/
npm run preview   # serve the built output at http://localhost:4173
```

## Switching to the real backend

One line, in `src/api/index.js`:

```js
const USE_MOCK = true;   // ← false
```

`mock.js` and `real.js` export the same functions with the same signatures, so
no page changes. In dev, `real.js` calls `/api/...` and the Vite dev server
proxies that to `http://localhost:8000` (see `vite.config.js`) — the browser
only ever talks to one origin, so there is no CORS setup to do.

## What the backend has to provide

Shapes and every call are documented in **`src/api/shapes.js`** — that file is
the contract, and both clients are written against it. Summary:

| Call | Method + path | Returns |
| --- | --- | --- |
| `login(username, password)` | `POST /api/auth/login/` | `user` (token kept internally) |
| `register(details)` | `POST /api/auth/register/` | `user` |
| `getMe()` | — | `user`, or `null` when signed out |
| `logout()` | `POST /api/auth/logout/` | — |
| `getMenu()` | `GET /api/menu/items/` | `menuItem[]` |
| `placeOrder(items, opts)` | `POST /api/orders/` | the created `order` |
| `getOrders()` | `GET /api/orders/` | student: own orders, newest first<br>staff/manager: `?status=PLACED,ACCEPTED,PREPARING,READY` |
| `getOrder(id)` | `GET /api/orders/{id}/` | `order` |
| `setStatus(id, status)` | `PATCH /api/orders/{id}/status/` | the updated `order` |
| `cancelOrder(id)` | `DELETE /api/orders/{id}/` | the cancelled `order` |

`register` takes `{ username, password, roll_number, email, phone_number }`.
`placeOrder` takes `items: [{ id, qty }]` plus
`{ counterId, idempotencyKey }` — see the notes below.

`getMe()` makes no request. The token and the user are kept in `sessionStorage`
together, so a refresh restores the session without a round trip.

### The shapes the pages are written against

```js
menuItem = { id, name, description, price, category, available, image, counter }
order    = { id, status, total, created_at, counter, items: [{ name, qty, price }] }
user     = { id, username, role }          // "student" | "staff" | "manager"

// status, exact strings, in the order an order moves through them:
PLACED → ACCEPTED → PREPARING → READY → COMPLETED
// and off the line, from PLACED or ACCEPTED only:
CANCELLED
```

These are **not** what Django sends. `real.js` translates — `toMenuItem`,
`toOrder`, `toOrderItem`, `unwrap` and `httpError` are the whole of it, each
exported and each covered by tests in `real.test.js`. The pages never see a
Django field name. What the translation absorbs:

- **Prices arrive as strings.** Django serialises `DecimalField` as `"80.00"`
  so it never loses a paisa to a float. `"80.00" + 20` is `"80.0020"`, which
  would put a wrong number on a bill, so every price and total is coerced once
  on the way in and is a number everywhere after that.
- **Lists are bare arrays today.** DRF would send `{ count, next, results }`
  if pagination were switched on; it is not. `unwrap` reads either, so turning
  it on later does not break the app.
- **Errors come in four shapes.** `detail`, `error`, `message`, or serializer
  errors like `{ roll_number: ["already exists"] }`. `httpError` finds the
  message wherever it is and also lifts out `field` (which input to blame) and
  `item_id` (which cart row ran out).
- **`category` and `counter` are objects, `category` renders as a string.**
- **`is_orderable` beats `is_available`** when both are present — a dish that
  is on the menu but out of stock is not orderable.

### Notes for whoever builds the API

- `order.items` stores the **name and price as they were when the order was
  placed**. Changing a menu price must not change what an old order says.
- `order.id` is a small integer. It is shown to students and called out at the
  counter as a token number (`#042`), so it needs to stay short.
- The server computes the total; the client never sends one.
- **`placeOrder` sends an `idempotency_key`.** It is minted when the cart is
  created and reused unchanged on every retry of the same basket. If a request
  quietly succeeds and the reply is lost — flaky campus wifi, exactly the
  demo conditions — the retry must return the **original order** rather than
  cook everything twice. The key lives in the cart context, not the Cart page,
  so navigating back to the menu does not reset it.
- **The out-of-stock `400` names the dish.** The cart tints that one row and
  leaves the rest of the basket alone; without an id the student has to rebuild
  five lines because the samosas went. `httpError` reads `item_id` — and only
  `item_id`, since the status code is an ordinary 400 shared with validation
  errors.
- `setStatus` only ever moves an order **one step forward**. Anything else
  should be a `409` — it stops a double-tap on the kitchen display from
  skipping a state.
- `cancelOrder` is a `DELETE`, and a `204` is fine: the client re-reads the
  order when the response has no body. It is refused for anything past
  `ACCEPTED`, and the client checks first so the button disappears rather than
  failing on tap.
- Auth is **token auth**. `login` and `register` must return the user *and* a
  token — `{ token, role, user_id }`, or dj-rest-auth's `{ key, user }`;
  `real.js` reads either, and rebuilds the username from what was typed when
  the response omits it. Every later request carries
  `Authorization: Token <token>`, including GETs. No cookies and no CSRF
  header. Moving to JWT means changing the word `Token` to `Bearer` in
  `authHeaders` in `src/api/real.js`, and nothing else.

### Answered by the backend team

These were the six ambiguities in the spec. All six were checked against the
Django source and answered, so the guessing branches are gone:

1. **`menu_item` on an order line is a plain dish name.** The serializer
   declares it `CharField(source='menu_item.name', read_only=True)`, so the id
   is not on the line at all. `toOrderItem` reads the string directly.
2. **Nothing is paginated.** No `DEFAULT_PAGINATION_CLASS`, no per-view
   `pagination_class`; every list is a bare JSON array. `unwrap` is kept as a
   one-line safety net for the day someone adds a `page_size` setting.
3. **Out of stock is `400`, not `409`,** with
   `{ error: 'insufficient_stock', detail, item_id }`. The failing item's id is
   under `item_id`. Nothing in the app keys off the status code for this —
   `item_id` being present is the whole signal — because a 400 is also what a
   plain validation failure returns.
4. **`counter_id` going in, `counter` coming back.** The create view reads
   `request.data.get("counter_id")` (an int); every response carries a nested
   `{ id, name }` under `counter`. This asymmetry is the one place a plausible
   guess fails silently: posting `counter` still returns `201`, and the order is
   filed against no counter. Pinned by a test in `real.test.js`.
5. **`image` is absolute** — DRF builds it with `request.build_absolute_uri()`,
   so it arrives as `http://host:8000/media/...`. Note for deployment: that host
   comes from the request's `Host` header, so a reverse proxy needs
   `USE_X_FORWARDED_HOST` set or the photos will point at the wrong machine.
6. **`roll_number` optional and unique is fine**, because Postgres treats
   multiple `NULL`s as distinct, and `RegisterView` skips the duplicate check
   when the value is empty. The backend team flagged that the register form only
   collected username and password, leaving every roll number `NULL` — that is
   already fixed here: the form collects roll number, email and phone, and marks
   whichever field the server names.

### The ACCEPTED fold

The backend has five forward states; the kitchen board draws three columns.
`ACCEPTED` means the kitchen has the ticket but nothing is in a pan yet, which
to the person at the pass is the same pile of work as `PLACED` — so
`columnFor()` in `shapes.js` folds it into the `PLACED` column, and the board's
filter, its tab counts, its chips and the "still to cook" tally all read from
that one function rather than from the raw status. The student's timeline still
shows all five steps, because a student does want to know the kitchen has seen
the order.

## Routes and roles

| Route | Who | What |
|---|---|---|
| `/login`, `/register` | anyone | one component, `src/pages/SignIn.jsx`, at two routes |
| `/menu`, `/cart` | student | browse and check out |
| `/orders`, `/orders/:id` | student | own orders, and one order tracked live |
| `/kitchen` | staff, manager | the wall board |
| anything else, incl. `/` | — | redirected to whatever that role's home is |

Who is signed in lives in one place, `src/auth.jsx`: it asks `getMe()` once on
load, hands down `user`, `signIn`, `signUp` and `signOut`, and never sees a
cookie or a token — that detail stays inside `src/api/`.

The `Require` guard in `src/App.jsx` waits for that first `getMe()` before
deciding anything, because bouncing to `/login` while the answer is still in
flight would sign a signed-in user out on every refresh. A student who opens
`/kitchen` is sent to `/menu` rather than shown an error: it is a typo, not an
attack. **The guard is convenience, not security** — the server is what refuses
a student's `setStatus` (403, in both `mock.js` and `real.js`), because a check
that only runs in the browser is one anybody can lift with devtools.

## Layout

```
src/
  api/
    index.js      the switch — USE_MOCK, and the only module pages import
    shapes.js     the contract: shapes, statuses, status transitions
    mock.js       in-memory fake backend
    real.js       HTTP client for Django
  styles/
    tokens.css    the whole design system: colour, type, space, shape
    base.css      reset and shared element defaults
  components/     shared pieces, one .jsx + .css each
  pages/          one folder-free .jsx + .css per page
```

Four of the components carry the menu's and checkout's personality, and are
the ones worth reading:

- `ArcPicker` — the menu's carousel mode. An ordinary horizontally scrolling strip with
  CSS scroll-snap, so momentum, snapping and keyboard focus are the browser's.
  Two things are added on top. The arc: each photo is pushed down by the
  *square* of its distance from the centre, which is what makes the row read as
  an arc rather than a ramp, and turned to face the middle with a `rotateY`
  under its own `perspective()` — per photo, not on the rail, because a shared
  vanishing point on a scrolling container stays at the container's centre and
  warps whatever has scrolled away from it (the maths is `src/lib/arc.js`, with
  tests). And a
  glide: a mouse wheel has no horizontal axis, so its notches are turned into
  motion by closing a fixed fraction of the remaining distance each frame —
  self-decelerating, with no duration to pick. Snapping is switched off only
  while the glide is driving, and handed straight back when it settles. At
  either end the wheel is left alone so the page keeps scrolling. One write per
  animation frame; flattens completely under `prefers-reduced-motion`. It is fed
  by the same category filter as the list, so the two menu modes never show
  different food.
- `ModeSwitch` — the two-position switch that chooses between the carousel and
  the plain list. Drawn as a physical control: a well cut into the page, a
  machined thumb sitting in it, one light source from above. The two glyphs are
  a single colour on a `mix-blend-mode: difference` layer, so the one under the
  pale thumb comes out dark and the one over the dark well comes out pale
  without a second rule for the active side. Pressed, the thumb loses its drop
  shadow and sinks rather than scaling. Thrown, it stretches along the
  direction of travel and squashes back before settling — that one-shot has to
  replay on every flip, and a CSS animation only restarts when its *name*
  changes, so the component alternates between two identical keyframes and
  starts on neither, which is what keeps it still on first paint.
- `CategoryPicker` — the category dropdown, drawn as the same physical
  language as the switch beside it: the trigger is a well cut into the page,
  darker than its surroundings with a lit lip; the open list is the opposite, a
  solid panel standing proud of the page with its top edge lit and a long
  shadow under it. Rows arrive one after another on a short spring and leave
  all at once, and the current one is marked by a bar in the left margin rather
  than a tick on the right, because a marker that lines up down one edge is
  found without reading.
- `Receipt` — the order confirmation, printed. The machine is a brushed-brass
  roller between two end caps, lit by a lamp that comes up while the motor is
  running; the roll waits inside it with only its last line showing. Printing
  is one transform on the paper, from parked to fully out, but travelled in
  three bursts with a beat between each — which is what a thermal printer
  actually does, and what one smooth slide never sounds like. It is a Web
  Animations keyframe list rather than CSS because the distance is measured,
  not authored: the item list is however long the order is, so a `ResizeObserver`
  recomputes the parked offset and the slot's height whenever the paper changes.
  The torn edge is a single conic gradient tiled along the bottom as a mask, so
  the teeth ride the emerging edge all the way out; the drop shadow lives on the
  parent, because a mask would cut a shadow away along with the teeth while a
  filter on the parent survives it. The room follows the skin, the brass and the
  paper do not — a till roll that turned blue with the theme would stop being a
  till roll. No animation library.

## Design

**Forest, brass and cream** — a deep emerald ground, warm cream type, and
brass as the only accent, at roughly 60 / 30 / 10. One typeface throughout,
Inter, set the way Apple sets type: optical sizing on (Inter's `opsz` axis
stands in for SF Text and SF Display), letter-spacing paired to every size
rather than one global value, and Semibold as the heaviest normal weight. Every
colour, size and radius lives in `src/styles/tokens.css`; no component defines
a colour of its own.

The finish is matte — the point of the palette. There is no glow behind the
page and nothing is frosted, because a blur, a saturation boost and a coloured
glow are all gloss. The ground is one long fall from forest 700 to forest 900,
the same wall the receipt prints against, and a fine SVG grain sits over the
whole page at 30% on `mix-blend-mode: overlay`: flat colour on a screen reads
as a fill, the same colour under grain reads as paint. Depth comes from the
other two matte tricks — a hairline lit along a panel's top edge, and three
stacked shadows (tight contact, mid, wide soft) instead of one blur. The only
gloss left in the app is the brass: the accent, and the printer's roller.

The kitchen display sets `data-surface="board"`, which re-points those same
tokens: no tinted layers, no grain, no shadow — flat solid forest tiles,
tighter radii, heavier type. Same palette, opposite treatment: texture is a
phone-in-hand pleasure and a liability on a wall display read from three
metres through steam. That contrast is what makes the board read as a
different machine.

## Offline by design

The mock backend makes no network requests, and the font is bundled with the
app (`@fontsource-variable/inter`) rather than loaded from Google. Dish photos
are local WebP files, looked up **by dish name** rather than by id — ids belong
to whichever database is answering, and keying photos by id meant every picture
moved the day the app pointed at the real backend. A photo the backend sends
(`item.image`) wins over the local file; a dish with neither gets a grey tile.
To confirm the built app talks to nothing outside itself:
`npm run build`, then `grep -r "https\?://" dist/assets/`.

## Demo switches

- `npm run photos` re-compresses the full-size dish photos in `src/assets/raw`
  into the 680px WebP files the app ships. Only the compressed ones are
  committed; 12 MB of originals became 1.1 MB.
- `?flaky` on any URL (e.g. http://localhost:5173/kitchen?flaky) makes the mock
  fail about half of all refreshes. There is no network to unplug with an
  in-memory backend, so this is how the "connection lost" banner and the
  keep-the-last-data behaviour are demonstrated.
- `npm test` runs the unit tests (`node --test`, no framework, no dependencies).
  56 of them, covering the money maths, the arc geometry, the late-order clock,
  the kitchen's column folding, and every translation `real.js` performs on a
  Django response — which is where a wrong assumption about the backend would
  otherwise surface as a wrong number on a bill.
