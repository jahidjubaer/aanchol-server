# 07 — Customer accounts and sample data

_Date: 2026-10-18_ · Client side: `aanchol-client/docs/14-customer-accounts.md`

## Owner's decisions
- Sign in with **phone + password** (free; no SMS). SMS codes can be added later.
- Forgotten password: the customer messages on WhatsApp, the admin makes a **one-time reset link** (24 h) and sends it.
- **Guest checkout stays.**
- **Sample data** goes into the local and Atlas databases, clearly marked, with one command to remove it.

## Privacy rule (why guest orders aren't linked by phone)
Numbers aren't verified, so anyone could sign up with someone else's number. An account therefore only shows orders **placed while signed in**, plus guest orders the customer **claims with the order number** (which must have been placed with the same phone). Orders are never linked by phone alone.

## Customer API (`/api/account`)
| Route | Notes |
|---|---|
| `POST /register {name, phone, password}` | Phone stored as `01XXXXXXXXX`; password ≥ 8 chars, scrypt-hashed. 409 if the number already has an account. 10 per hour per connection |
| `POST /login {phone, password}` | Same answer for unknown number and wrong password. 10 failed tries per 15 min. Paused accounts get 403 |
| `POST /reset {token, password}` | Uses the admin's one-time link; signs out other devices |
| `GET/PATCH /me` | Name and email (optional) |
| `POST /password {current, password}` | Returns a fresh login; other devices are signed out |
| `POST/PATCH/DELETE /addresses[/:id]` | Up to 5, one default (`makeDefault: true`) |
| `PUT /wishlist`, `POST /wishlist/merge` | Up to 100 slugs. Merge adds the device's list after signing in |
| `GET /orders`, `GET /orders/:number` | Own orders only, with a `timeline` of status dates (no admin names or notes) |
| `POST /orders/claim {orderNumber}` | Adds a guest order placed with the same phone |

Login is a bearer token (30 days) with audience `customer`. Admin routes refuse customer tokens and vice versa. Each customer has a `tokenVersion`; password change, reset or pause raises it, so older logins stop working.

`POST /api/orders` reads the login if sent: signed-in orders get `customerId`. A missing or expired login never blocks an order, it just becomes a guest order.

## Admin API
| Route | Notes |
|---|---|
| `GET /api/admin/customers?q=&page=` | Search by phone digits or name; includes order count |
| `GET /api/admin/customers/:id` | Profile, addresses, their orders |
| `PATCH /api/admin/customers/:id {active}` | Pause / unpause (pausing signs out everywhere) |
| `POST /api/admin/customers/:id/reset-link` | `{ token, expiresAt }`; the admin page builds the link |

## Sample data
| Command | Does |
|---|---|
| `npm run sample:add` | Adds 3 Jamdani + 4 jewellery sample products (jewellery set to **live**, its old status remembered), a sample customer with 2 addresses and a wishlist, 3 orders for that customer and 4 guest orders in every status, and a sample 10% Eid campaign **switched off** |
| `npm run sample:add -- --campaign-live` | Same, with the campaign running (real prices drop 10%!) |
| `npm run sample:remove` | Deletes everything marked `sample: true` and restores jewellery's status. Real data is never touched |

- Every sample document has `sample: true` (hidden from the shop's JSON, shown as a "Sample" badge in the admin). Sample product names say "Sample product" in the description and carry a "Sample" label.
- Sample phone numbers use the **011 range**, which has no operator in Bangladesh, so they can never belong to a real customer. Real customers can't sign up with 011 numbers; signing in with them works only for the sample account.
- Sample customer login: phone `01100000001`, password from `SAMPLE_CUSTOMER_PASSWORD` in `.env`, or a random one printed by the command. `npm run dev:memory` loads all sample data with the campaign running (password `sample-pass-123` unless set).
- Running `sample:add` again replaces the samples rather than duplicating them.

**Before launch:** `npm run sample:remove` against Atlas.

## Tests
`test/account.test.js` (14): sign-up rules, sign-in, token separation, password change sign-out, addresses, wishlist merge, linked and guest orders, claiming, cross-account access, admin list, reset link, pausing, sample add/remove. Total 68 passing.
