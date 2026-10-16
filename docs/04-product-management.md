# 04 — Product Management & Photo Uploads

_Date: 2026-10-17_

## What was done

### Admin product API (login required)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/admin/products` | Every product, including hidden ones (`active`, `updatedAt`) |
| GET | `/api/admin/products/:slug` | One product |
| POST | `/api/admin/products` | Create. The web address (slug) is made from the name |
| PATCH | `/api/admin/products/:slug` | Edit only the fields sent; `null` removes an optional field (e.g. the old price) |
| DELETE | `/api/admin/products/:slug` | Only for products that were **never ordered**; otherwise `409` and a suggestion to hide |
| GET | `/api/admin/uploads` | `{ enabled }`: whether the Cloudinary keys are set |
| POST | `/api/admin/uploads/signature` | A one-time signature for one photo upload |

### Rules (`src/utils/validateProduct.js`)
- **Required:** name, category (`jamdani` or `jewellery`, see `PRODUCT_CATEGORIES`), price (whole taka), stock (0–999) and the two pattern colours.
- **Old price** (`compareAt`) must be higher than the price.
- **Text limits** (e.g. description up to 2000 characters); thread count is a whole number.
- **Photos:** up to 8, and only Cloudinary URLs or the temporary `/images/...` placeholders. Links to other websites are refused.
- **The web address never changes after creation:** old links and orders keep working. Fields the admin can't edit (`slug`, `_id`…) are ignored.
- **Slugs:** "Rokto Kolka — Jamdani!" becomes `rokto-kolka-jamdani`. A duplicate gets a number, e.g. `…-482`. A Bangla-only name becomes `product-…`.
- **Hiding** (`active: false`) removes a product from the shop and its API, but keeps it for orders.

### Photo uploads (Cloudinary, signed direct upload)
1. The admin asks our server for a signature (`POST /api/admin/uploads/signature`).
2. The browser sends the photo **straight to Cloudinary** with that signature.
3. Cloudinary returns the photo URL, which is saved with the product.

- Photos never pass through the Render server, which is slow and memory-limited on the free tier, and no upload packages were needed.
- The **API secret never leaves the server**. A signature works only for the `aanchol/products` folder and for about an hour.
- The signature follows Cloudinary's documented rule (`src/utils/cloudinary.js`) and is covered by a test.
- Without keys, everything works except photo uploads, and the admin says so.

## Needs from you
1. Create a free account at **cloudinary.com**.
2. Copy **Cloud name**, **API key** and **API secret** (Dashboard → API Keys) into `server/.env`:
   ```
   CLOUDINARY_CLOUD_NAME=
   CLOUDINARY_API_KEY=
   CLOUDINARY_API_SECRET=
   ```
3. Restart the server. The "Add photos" tile appears in the admin.

## Verification
- `npm test`: **36 tests** (12 new in `test/admin-products.test.js`): login required, create, slugs, field errors, price rule, partial edits, hide, delete versus has-orders, uploads off without keys, the secret never sent, and the signature formula.
- **End to end in headless Chrome:** a local stand-in for Cloudinary's upload endpoint **checked each signature the way Cloudinary does** (both photos: "signature OK"), then returned Cloudinary demo photos. See client doc `09`.
