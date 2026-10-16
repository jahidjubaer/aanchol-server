// npm run dev:memory  →  runs the API on a temporary in-memory MongoDB, already seeded.
// For working before MongoDB Atlas is set up. Everything is wiped when it stops.
import { MongoMemoryServer } from 'mongodb-memory-server'

const mongo = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongo.getUri('aanchol')

const { seedProducts } = await import('../src/seed/seed.js')
await import('../src/server.js')
console.log(`Seeded ${await seedProducts()} products into the in-memory database.`)

process.on('exit', () => mongo.stop())
