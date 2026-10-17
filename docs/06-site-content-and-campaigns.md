# 06 — Site content: categories, hero slides, campaigns, home layout

_Date: 2026-10-17_

The shop's content now comes from the database, so the owner manages it in the admin without code changes.
New product lines (Muslin, Manipuri, Salwar Kameez, men's...) are added as **categories**.

## Public
| Route | Returns |
|---|---|
| `GET /api/site` | `categories` (not hidden, by order), `slides` (active and inside their dates), `campaign` (the running one or `null`), `announcement` (lines for the top bar), `homeSections` (`[{ id, visible }]` in order) |
| `GET /api/products` | Only products in **live** categories. While a campaign covers a product it also has `salePrice` |

## Admin (login required, under `/api/admin`)
| Route | Notes |
|---|---|
| `GET/POST /categories`, `GET/PATCH/DELETE /categories/:slug` | The slug is set once (from the name, or sent as `slug`) and never changes. Delete is refused while products use the category: hide it instead. A type products still use can't be removed (rename keeps its slug) |
| `GET/POST /slides`, `GET/PATCH/DELETE /slides/:id` | Up to 8. Photo must be uploaded through the admin. Buttons need both a label and a link (a page like `/collections/jamdani` or an `https://` link) |
| `GET/POST /campaigns`, `GET/PATCH/DELETE /campaigns/:id` | Campaigns can't overlap while switched on. `percentOff` 0–70 (0 = announcement only). `categories: []` means every category |
| `GET/PATCH /settings` | `announcement` (up to 3 lines) and `homeSections` (all sections, any order). The response also lists the section names |

## Models
- **Category**: `slug, name, nameBangla, intro, banner, status (live | coming-soon | hidden), inNav, order, template (saree | general), types [{ slug, label }]`.
  `template` decides the product form: `saree` shows fabric, thread count, weaver; `general` shows free-form detail rows.
  `types` are the filter chips inside the category page (e.g. Jewellery: Wood, Carved, Handmade).
- **Product** gained `type` (one of its category's types) and `details [{ label, value }]`.
- **HeroSlide**: photo + optional phone photo, eyebrow, title + italic second line, Bangla line, text, two buttons, `overlay` (0–90 % shade), `align` (left | center), `order`, `active`, optional `startsAt`/`endsAt`.
- **Campaign**: admin `name`, customer `title`/`titleBangla`/`message`/`image`, button, `percentOff`, `categories`, `startsAt`/`endsAt`, `popup`, `active`.
- **SiteSettings**: one document (`key: 'site'`) with `announcement` and `homeSections`.

## How the discount is charged
- `services/pricing.js` is the only place prices are worked out: `priceFor(product, campaign)` rounds to whole taka.
- At checkout the server uses the campaign running **at that moment**. Each order line stores `price` (paid) and `listPrice` (full, only when discounted); the order stores `campaign { name, title, percentOff }`.
- The shop sends `expectedSubtotal` (what the bag showed). If it differs, e.g. the sale ended mid-checkout, the order is refused with `409 { code: 'PRICE_CHANGED', subtotal }` **before** any stock is taken. Older clients that don't send it still work.

## Starting content
On start, `ensureSiteDefaults()` (`src/seed/content.js`) fills an **empty** database once: Jamdani (live, saree form), Jewellery (coming soon, with Wood/Carved/Handmade), two hero slides and the default announcement. The settings document marks it as done, so anything the admin deletes later doesn't come back. The existing Atlas database gets this automatically on the next deploy. Products are not touched.

`npm run seed` also adds any missing default category, since products only show in existing categories.

## Tests
`test/content.test.js` (18 tests): defaults, category rules, live-only products, slide dates and validation, campaign pricing at checkout, the price-change refusal, overlap checks, home layout. Total 54 passing.
