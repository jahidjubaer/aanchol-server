// npm run dev:memory  →  runs the API on a temporary in-memory MongoDB, already seeded.
// For working before MongoDB Atlas is set up. Everything is wiped when it stops.
import { randomBytes } from 'node:crypto'
import { MongoMemoryServer } from 'mongodb-memory-server'

// Local-only test login, see .env.example. Never used outside dev:memory.
const DEV_ADMIN = {
  email: process.env.DEV_ADMIN_EMAIL || 'admin@aanchol.test',
  name: 'Dev Admin',
  password: process.env.DEV_ADMIN_PASSWORD || 'dev-only-password',
}

const mongo = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongo.getUri('aanchol')
process.env.JWT_SECRET ||= randomBytes(32).toString('hex')

const { seedProducts } = await import('../src/seed/seed.js')
const { upsertAdmin } = await import('../src/seed/admins.js')
await import('../src/server.js')
console.log(`Seeded ${await seedProducts()} products into the in-memory database.`)
await upsertAdmin(DEV_ADMIN)
console.log(`Dev admin login: ${DEV_ADMIN.email} (password in .env.example)`)

process.on('exit', () => mongo.stop())
