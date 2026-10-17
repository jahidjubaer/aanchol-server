# 10 — bKash / Nagad advance (Send Money, checked by hand)

_Date: 2026-10-18_ · Shop side: `aanchol-client/docs/17-bkash-nagad-advance.md`

No payment gateway: bKash and SSLCommerz charge fees, so customers use **Send Money** to the shop's personal bKash or Nagad number and type the transaction ID. The admin checks it in the app.

## Rules (from the owner)
- To confirm an order, the customer pays the **delivery charge** in advance, or the **full amount**. The rest is cash on delivery.
- When delivery is free (inside Dhaka), the advance is a fixed **৳120** (`minAdvance`, editable in Settings).
- An order with an advance **can't be confirmed until the admin marks the payment received**.

## Settings
`SiteSettings.payments = { bkash: { enabled, number }, nagad: { enabled, number }, minAdvance }`, saved with `PATCH /api/admin/settings { payments }`.
- A wallet can only be turned on with a valid 01[3-9] number.
- **Off by default.** While both wallets are off, orders are plain cash on delivery, as before.
- `/api/site` returns `payments`, since the numbers are shown to customers.

## Orders
- Advance = `min(total, max(delivery fee, minAdvance))`, or the whole total for `plan: 'full'` (`services/payments.js`).
- No advance is needed when a gift card pays for everything.
- `POST /api/orders` takes `payment: { method: 'bkash'|'nagad', plan: 'advance'|'full', trxId, sender, amount }`:
  - `trxId` is 8–12 letters and digits; spaces and case don't matter.
  - `amount` is what checkout showed. A mismatch returns 409 `PRICE_CHANGED { advance }`.
- **A TrxID can pay for one order only.** This is checked before stock is taken and also enforced by a unique index on (method, trxId).
- `order.payment`:
  - `method`, `plan`, `advance`, `trxId`, `sender`
  - `verified`, `verifiedAt`, `verifiedBy` (the last one is admin only)
  - `paid`: set when the payment is verified and was the full amount, or when the order is delivered
  - `order.total` is the whole amount, so cash to collect is `total − advance`

## Admin
- `PATCH /api/admin/orders/:id { paymentVerified: true }` marks the payment received.
- Confirming an order whose payment hasn't been checked returns 409, with the TrxID in the message.
- `GET /api/admin/orders?status=payment` lists new orders whose payment needs checking. `counts.payment` and `/api/admin/badges` → `payments` give the counts.
- Orders carry a `paymentToCheck` flag.
- Gift cards can also be paid by Nagad (`GIFT_CARD_PAYMENTS`).

## Tests
`test/payments.test.js` has 7 tests: settings, cash on delivery while wallets are off, advance amounts (৳120 / ৳150 / full), amount changed, a reused TrxID, a gift card covering everything, and verification before confirmation. 88 tests pass in total.
