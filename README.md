# aanchol-server

The API behind the Aanchol shop: products and orders. Built with Express 5, MongoDB (Mongoose) and JavaScript (ES modules).

## Quick start

```bash
npm install
npm run dev:memory   # no database needed: temporary in-memory MongoDB, already seeded
```

The API runs at http://localhost:4000. Run the client (`aanchol-client`) with `npm run dev` next to it.

### With MongoDB Atlas

```bash
cp .env.example .env   # paste your Atlas connection string into MONGODB_URI
npm run seed           # loads the sample products
npm run dev            # restarts on file changes
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | API with auto-restart, using `MONGODB_URI` from `.env` |
| `npm run dev:memory` | API on a temporary in-memory database (wiped on stop) |
| `npm run seed` | Inserts or updates the sample products (orders are untouched) |
| `npm start` | Production start (Render) |
| `npm test` | API tests on an in-memory database |

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok, db }` |
| GET | `/api/products?category=jamdani` | Active products, newest first |
| GET | `/api/products/:slug` | One product, or 404 |
| POST | `/api/orders` | Places a cash-on-delivery order (limited to 10 per 15 minutes per IP) |

`POST /api/orders` body:

```json
{
  "customer": { "name": "…", "phone": "01712345678", "email": "", "city": "Dhaka", "address": "…", "note": "" },
  "delivery": "inside-dhaka",
  "items": [{ "slug": "rokto-kolka-jamdani", "qty": 1 }]
}
```

Errors always come back as `{ "error": "message", ... }`:
- `400` with `fields`: wrong customer details (same messages as the checkout form)
- `409` with `items: [{ slug, available }]`: not enough stock

Documentation for each task is in [`docs/`](docs/).
