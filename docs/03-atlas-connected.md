# 03 — MongoDB Atlas Connected

_Date: 2026-10-17_

## What was done
- The owner created the Atlas cluster and added `MONGODB_URI` to `server/.env`.
- **Database name:** set to `aanchol` in the connection string (`…mongodb.net/aanchol?…`). Without it, MongoDB uses a database called `test`.
- **`JWT_SECRET`:** generated (64 random hex characters) and written to `.env`.
- **Products:** ran `npm run seed`, which loaded the 6 sample saris into Atlas.

`.env` is ignored by git and never committed. Keep a copy somewhere safe (e.g. a password manager); it's needed again when deploying to Render.

## Remaining step for the owner
Create your real admin login:

```bash
cd server
npm run create-admin
```

Run this in your own terminal: it asks for the email, name and password (10+ characters) and hides the password while you type.

## Verification
- `npm run seed`: "MongoDB connected: aanchol · Seeded 6 products." ✅
- `GET /api/health` returns `{ ok: true, db: "connected" }` ✅
- `GET /api/products` returns the 6 saris from Atlas ✅
