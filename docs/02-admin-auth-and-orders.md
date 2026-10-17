# 02 — Admin Login & Order Management

_Date: 2026-10-17_

## What was done

### Admin accounts
- `Admin` model: email, name, `passwordHash`, `active`, `lastLoginAt`.
- **Passwords:** hashed with **scrypt** (built into Node), stored as `salt:hash`. The plain password is never stored or returned.
- **`npm run create-admin`:** asks for email, name and password (nothing is shown while the password is typed), then creates the admin in the database in `MONGODB_URI`. Running it again with the same email **resets the password**.
- **Deactivating an admin:** set `active: false` in the database. Their session stops working at the next request.

### Login: `POST /api/admin/login`
- Returns `{ token, admin: { email, name } }`. The token is a signed JWT (HS256, 7 days) using `JWT_SECRET`.
- **Same answer for a wrong password and an unknown email**, and both take the same time, so nobody can find out which emails are admins.
- **Brute-force limit:** 5 failed attempts per 15 minutes per IP. Successful logins don't count.
- **Why a bearer token instead of a cookie:** the shop (Vercel/your domain) and the API (Render) are on different domains. Browsers increasingly block cookies across domains, especially Safari, but a token in the `Authorization` header always works.

### Order management (login required)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/me` | The logged-in admin |
| GET | `/api/admin/orders?status=&q=&page=` | 20 per page, newest first, plus `counts` per status |
| GET | `/api/admin/orders/:orderNumber` | One order with `adminNote`, `statusHistory`, `next` |
| PATCH | `/api/admin/orders/:orderNumber` | `{ status?, adminNote? }` |

- **Search (`q`):**
  - Order number: `AN-7KQ` matches the start of a number.
  - Phone digits: `0171`, `+88 0171…`.
  - Customer name: not case-sensitive.
- **Status steps** are enforced (`ORDER_TRANSITIONS` in `config/shop.js`):
  `pending → confirmed → shipped → delivered`. Cancelling is possible while pending or confirmed; delivered and cancelled are final.
- **Cancelling puts the stock back.** It's safe against double clicks and two open tabs: the status changes only if nobody changed it in the meantime, so stock comes back exactly once.
- **Delivered** marks the order as paid (cash collected on delivery).
- **`statusHistory`** records every step with the time and which admin did it.
- **`adminNote`:** a private note (up to 1000 characters), never included in customer responses.

### Config
- New env vars: `JWT_SECRET` (required, 32+ characters), plus `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` used only by `dev:memory`.
- `npm run dev:memory` now also creates the local test admin and a random `JWT_SECRET`.

## Needs from you (when Atlas is ready)
1. Add `JWT_SECRET` to `.env` (the command to make one is in `.env.example`).
2. Run `npm run create-admin` and choose a **strong password** (10+ characters; a passphrase is best).

## Verification
- `npm test`: **24 tests**, all passing (12 new in `test/admin.test.js`):
  - **Login:** wrong passwords and forged, garbage or other-secret tokens are refused; a deactivated admin is logged out.
  - **Orders:** search, status steps (including refusing skipped steps), stock coming back exactly once when 3 cancels arrive together, and the private note staying private.

## Fix (2026-10-17): `create-admin` crashed on Node 23
- **Problem:** the script crashed at the password step with `Cannot read properties of undefined (reading 'bind')`. It relied on a hidden readline function that Node 23 no longer has.
- **Fix:** the password is now hidden with a plain output stream, which works on every Node version.
- **Checks before saving:** the script now checks the password before connecting to the database. A mismatch or a password under 10 characters stops with a clear message and saves nothing.
- **Tested** against an in-memory database: a correct password creates the admin, and a short or mismatched one saves nothing.
