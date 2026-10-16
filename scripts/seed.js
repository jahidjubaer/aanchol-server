// npm run seed  →  loads the sample products into the database in MONGODB_URI.
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/db.js'
import { seedProducts } from '../src/seed/seed.js'

await connectDb(env.mongoUri())
const count = await seedProducts()
console.log(`Seeded ${count} products.`)
await disconnectDb()
