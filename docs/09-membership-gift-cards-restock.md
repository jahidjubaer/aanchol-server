# 09 — Membership, gift cards, gift wrap, restock requests, complete the look

_Date: 2026-10-18_ · Shop side: `aanchol-client/docs/16-rewards-and-gifting.md`

## Decisions (from the owner)
- Membership counts **delivered orders, all time**. A level is never lost.
- The member discount **comes off the sale price** during a campaign (Eid 10% then Gold 5%).
- Membership only, **no points**.
- Gift cards are **ordered online, paid by bKash or cash, activated by the admin**.

## Membership (`services/membership.js`)
- Levels live in `SiteSettings.memberTiers` and default to `DEFAULT_MEMBER_TIERS` in `config/shop.js`:

  | Level | Spend from | Discount |
  |---|---|---|
  | Silver | ৳5,000 | 3% |
  | Gold | ৳10,000 | 5% |
  | Platinum | ৳20,000 | 8% |
  | Diamond | ৳30,000 | 12% |

  The admin edits them with `PATCH /api/admin/settings { memberTiers }`: 1 to 6 levels, a discount of 1 to 20%, and each higher level must give more.
- **Spend** is the sum of `subtotal − member.discount` over the customer's delivered orders. Delivery and gift wrap are not counted. It is worked out fresh each time, never cached, so cancelling a delivered order or editing the levels takes effect at once.
- **Card number:** 8 random digits, given the first time a customer reaches a level (`Customer.memberNo`, `memberSince`).
- `GET /api/account/membership` returns `{ spent, tier, next: {…, remaining}, tiers, memberNo, memberSince }`.
- `GET /api/admin/customers/:id/membership` returns the same for the admin.

## Orders (`services/orders.js`)
Total = subtotal (sale prices) − member discount + delivery + gift wrap − gift card.
- `order.member = { tier, percent, discount }` is set only for signed-in members. Guests get no member discount.
- `order.giftWrap = { message, fee }`: the fee comes from settings and can be switched off. The message is at most 200 characters.
- `order.giftCard = { code, amount }`: the card pays as much as its balance allows. The public JSON masks the code as `GIFT-••••-MX4P`.
- `order.total` is now **what's left to collect** (0 when the gift card covers everything).
- **`expectedTotal`** is optional and is the total before the gift card. A mismatch returns 409 `PRICE_CHANGED`, with `memberPercent` and `giftWrapFee`, before any stock is taken.
- **Cancelling** an order puts the gift card amount back on the card, and only once.
- If the order fails after the card was charged, stock and the card are both restored.

## Gift cards (`models/GiftCard.js`, `services/giftCards.js`)
- **Lifecycle:**
  - `pending`: ordered on the shop, with reference `GC-XXXXXX`.
  - `active`: the admin marked it paid. It then gets code `GIFT-XXXX-XXXX` and is valid for 12 months.
  - `cancelled`: only possible while pending, or while active and never used.
  - Derived states: `used` (balance 0) and `expired`.
- **Codes:** 8 characters from the 32-letter alphabet used for order numbers. Typed codes are normalised, so `gift 7kq2 mx4p` works.
- **Spending is atomic:** `balance >= amount` is checked inside the same update.
- **Public routes:**
  - `POST /api/gift-cards` orders a card (rate limited; linked to the account when signed in).
  - `POST /api/gift-cards/check { code }` returns the balance (15 tries per 15 minutes).
- **Account route:** `GET /api/account/gift-cards` lists the cards the customer ordered, with codes once they're active.
- **Admin routes:**
  - `GET /api/admin/gift-cards?status=&q=&page=`
  - `GET` and `PATCH /gift-cards/:id` (`adminNote`)
  - `POST /gift-cards` creates a card that's active straight away, for cards sold in person
  - `POST /:id/activate` and `POST /:id/cancel`

## Restock requests (`models/StockAlert.js`, `services/stockAlerts.js`)
- `POST /api/products/:slug/notify { phone, name? }` only works while the piece is sold out (409 otherwise). Each number gets one open request per piece.
- `GET /api/admin/stock-alerts` groups requests by piece, with pieces back in stock first.
- `POST /api/admin/stock-alerts/:id/done` marks a person as told, after the admin sends the WhatsApp message.
- `GET /api/admin/badges` returns `{ giftCards: pending, restock: people who can be told now }` for the admin tab counts.

## Complete the look
`Product.pairsWith` holds up to 6 product slugs, set in the admin. The shop skips any that are missing or sold out.

## Site data
`/api/site` also returns `memberTiers` and `giftWrap`.

## Sample data
`sample:add` also adds:
- 2 gift cards: one waiting for payment, and one active card on the sample customer with ৳2,000 left
- 3 restock requests
- pairings on Shada Paar Jamdani

The sample customer is Gold (৳12,700 delivered). `sample:remove` deletes all of it.

## Tests
`test/rewards.test.js` has 13 tests covering levels, stacking with a sale, total checks, gift wrap, the gift card lifecycle, partial and full payment, refunds, restock requests, pairings and sample data. 81 tests pass in total.
