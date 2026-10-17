// npm run categories:add  →  adds any default category the database doesn't have yet
// (src/seed/content.js). Categories already there, and their settings, are never changed.
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/db.js'
import { Category } from '../src/models/Category.js'
import { defaultCategories, ensureDefaultCategories } from '../src/seed/content.js'

await connectDb(env.mongoUri())
const before = new Set((await Category.find({}, 'slug').lean()).map((c) => c.slug))
await ensureDefaultCategories()
const added = defaultCategories.filter((c) => !before.has(c.slug))
console.log(added.length ? `Added: ${added.map((c) => `${c.name} (${c.status})`).join(', ')}` : 'Nothing to add: every default category is already there.')
await disconnectDb()
