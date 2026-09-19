# API Contract — Campus Canteen Order System

This describes exactly what the backend returns, matching the real code file-for-file.

If the backend code ever changes, update this file too — don't let them drift apart.

Base URL (development): http://localhost:8000/api/

Authenticated endpoints require this header:
Authorization: Token <token>


---

## Auth

### POST /api/auth/register/

No auth required. Registers a new student.

**Request body:**

{
  "username": "moksh123",
  "roll_number": "CS2026001",
  "email": "moksh@college.edu",
  "phone_number": "9876543210",
  "password": "somepassword123"
}

**Success response (201):**

{
  "username": "moksh123",
  "roll_number": "CS2026001",
  "email": "moksh@college.edu",
  "phone_number": "9876543210"
}

(Note: password is never returned. Every registered user is automatically given the
"student" role — there is no way to self-register as staff or manager.)

**Error response (400) — roll number already used:**

{
  "error": "roll_number_taken",
  "detail": "This roll number is already registered."
}


---

### POST /api/auth/login/

No auth required.

**Request body:**

{
  "username": "moksh123",
  "password": "somepassword123"
}

**Success response (200):**

{
  "token": "9944b09199c62bcf9418ad846dd0e4bbdfc6ee4b",
  "role": "student",
  "user_id": 1
}

**Error response (401):**

{
  "error": "invalid_credentials",
  "detail": "Username or password is incorrect."
}


---

## Menu

### GET /api/menu/categories/

No auth required.

**Success response (200):**

[
  {
    "id": 1,
    "name": "Beverages",
    "display_order": 1
  },
  {
    "id": 2,
    "name": "Snacks",
    "display_order": 2
  }
]


---

### GET /api/menu/items/?category=&counter=

No auth required. Both query params optional.

**Success response (200):**

[
  {
    "id": 1,
    "name": "Veg Thali",
    "description": "Rice, dal, sabzi, roti",
    "price": "70.00",
    "category": {
      "id": 2,
      "name": "Snacks",
      "display_order": 2
    },
    "counter": {
      "id": 1,
      "name": "Main Kitchen",
      "slug": "main-kitchen"
    },
    "stock_quantity": 5,
    "is_available": true,
    "is_orderable": true,
    "image": null
  }
]

("image" is either null or a full URL like
http://localhost:8000/media/menu/thali.jpg,
depending on whether one was uploaded.)


---

### GET /api/menu/items/<id>/

No auth required. Same shape as a single item above.


---

## Counters

### GET /api/counters/

No auth required.

**Success response (200):**

[
  {
    "id": 1,
    "name": "Main Kitchen",
    "slug": "main-kitchen",
    "is_active": true
  }
]


---

## Orders

### GET /api/orders/?counter=&status=

Auth required. Students see only their own orders. Staff/manager see all orders,
filterable by "counter" (id) and "status" (comma-separated, e.g. "PLACED,ACCEPTED").

**Success response (200):** array of order objects, same shape as the detail response below.


---

### POST /api/orders/

Auth required. Places a new order.

**Request body:**

{
  "counter_id": 1,
  "items": [
    {
      "menu_item_id": 1,
      "quantity": 2
    }
  ],
  "idempotency_key": "a1b2c3d4-generate-a-fresh-uuid-per-checkout-attempt"
}

**Success response (201):**

{
  "id": 1,
  "order_number": "ORD-2026-0001",
  "status": "PLACED",
  "counter": {
    "id": 1,
    "name": "Main Kitchen"
  },
  "total_amount": "140.00",
  "items": [
    {
      "menu_item": "Veg Thali",
      "quantity": 2,
      "unit_price": "70.00"
    }
  ],
  "status_log": [
    {
      "status": "PLACED",
      "timestamp": "2026-09-19T13:02:11Z"
    }
  ],
  "created_at": "2026-09-19T13:02:11Z"
}

**Error response (400) — not enough stock:**

{
  "error": "insufficient_stock",
  "detail": "Only 1 unit(s) of 'Veg Thali' left.",
  "item_id": 1
}

Note: sending the same "idempotency_key" twice does NOT create a second order — it
returns the original order again with a 201, unchanged.


---

### GET /api/orders/<id>/

Auth required. Full order detail — same shape as the POST success response above.


---

### DELETE /api/orders/<id>/

Auth required. Cancels the order. Only the student who placed it can cancel, and only
while "status" is still "PLACED".

**Success response (200):**

{
  "id": 1,
  "status": "CANCELLED"
}

**Error response (400) — too late to cancel:**

{
  "error": "cannot_cancel",
  "detail": "Order can only be cancelled while it's still Placed."
}

**Error response (403) — not your order:**

{
  "error": "forbidden",
  "detail": "You can only cancel your own order."
}


---

### PATCH /api/orders/<id>/status/

Auth required, staff/manager role only. Advances the order to the next status.

**Request body:**

{
  "status": "ACCEPTED"
}

**Success response (200):** full order object, same shape as GET detail, with the new
status and an extra entry appended to "status_log".

**Error response (400) — invalid move:**

{
  "error": "invalid_transition",
  "detail": "Cannot move from PLACED to READY."
}

**Error response (403) — student tried this:**

{
  "error": "forbidden",
  "detail": "Only staff can update status."
}


---

## Status flow reference

PLACED → ACCEPTED → PREPARING → READY → COMPLETED
PLACED → CANCELLED
ACCEPTED → CANCELLED

No other transitions are allowed. Cancelling restores stock automatically.


---

## Notes for frontend

- "idempotency_key": generate one fresh UUID when the user opens the cart/checkout page,
  keep reusing that same key if a request needs retrying (e.g. after a network error),
  only generate a new one when they start a genuinely new order.

- "total_amount" is always calculated by the backend — never compute or trust a
  client-side total for the actual charge.

- One order = one counter. There's no way to order from two counters in a single
  checkout — clear the cart or split into two orders if items are from different counters.

- Every list/detail response uses these exact field names — if something looks
  different once the backend is running, that means the code and this doc have drifted;
  flag it rather than guessing.