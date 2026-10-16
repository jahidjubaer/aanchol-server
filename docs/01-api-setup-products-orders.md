# 01 — API Setup: Products & Orders

_Date: 2026-10-17_

## What was done

### Stack
- **Express 5** (async errors handled without wrappers), **Mongoose 9**, JavaScript ES modules.
- **Node ≥ 22.9:** `.env` is loaded with Node's own `--env-file-if-exists`, so `dotenv` isn't needed.
- **Security:**
  - `helmet` headers.
  - `cors` limited to `CLIENT_ORIGIN`.
  - JSON body limit of 20 KB.
  - `trust proxy` set for Render.
  - Rate limit on placing orders: 10 per 15 minutes per IP.

### Structure
```
src/
  server.js         start: connect DB, listen, graceful shutdown
  app.js            Express app (used by server and tests)
  db.js             Mongoose connection
  config/env.js     environment variables
  config/shop.js    delivery options and fees, order statuses, order limits
  models/           Product, Order
  routes/           products, orders
  services/orders.js  order creation and stock handling
  middleware/errors.js  404 + JSON error handler
  utils/            validateOrder, orderNumber, HttpError
  seed/             sample products + seed function
scripts/            seed.js, dev-memory.js
test/api.test.js
```

### Products
- `GET /api/products` (optional `?category=`) and `GET /api/products/:slug`.
- They return the same fields the client uses today. Internal fields (`_id`, `active`, timestamps) are hidden.
- `active: false` hides a product without deleting it.

### Orders: `POST /api/orders`
- **The browser sends only slugs and quantities.** Prices, the delivery fee and the total are worked out on the server from the database, so nobody can change a price in the browser.
- Customer details are checked with the same rules and messages as the checkout form. The phone number is saved as `01XXXXXXXXX`.
- **Stock is safe:**
  - Each sari's stock is reduced only if enough is left, as a single database step. Two people can't both buy the last sari (tested with 5 orders at the same moment: 1 succeeds, 4 are told it sold out).
  - If one item in a multi-item order fails, the stock already taken for the others is put back.
  - Repeated lines for the same sari are added together before checking.
- **Order numbers:** `AN-` plus 6 random characters, skipping 0/O and 1/I so they're easy to read on the phone (e.g. `AN-7KQ2MX`).
- Each order saves the price at the time of ordering, delivery, customer, `payment: { method: 'cod', paid: false }` and `status: 'pending'`.
- Statuses: pending → confirmed → shipped → delivered, or cancelled.

### Local development without Atlas
`npm run dev:memory` starts a temporary in-memory MongoDB, seeds it and runs the API. Everything is wiped when it stops.

## Client changes (aanchol-client)
- `src/utils/api.js` and `VITE_API_URL` (see `client/.env.example`, default `http://localhost:4000`).
- Checkout now **sends the order to the API**:
  - While sending: a spinner and the button is disabled.
  - Detail errors from the server show under the fields.
  - Sold out: the bag is corrected automatically and a message asks the customer to check it.
  - Server unreachable: a message with an "Order on WhatsApp" link.
- The confirmation page shows the order the server saved, with its real order number.
- Product pages still use the sample data in the client; switching them to the API is the next step.

## Needs from you
1. **A MongoDB Atlas account.** Free M0 cluster: choose region **Mumbai (ap-south-1)**, the closest to Bangladesh.
2. Create a database user and allow network access `0.0.0.0/0` (Render's free tier has no fixed IP).
3. Put the connection string in `server/.env` as `MONGODB_URI`, then run `npm run seed`.

## Verification
- `npm test`: 12 API tests on an in-memory MongoDB (see `test/api.test.js`).
- The full checkout was tested in the browser against the running API.
