import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDb, disconnectDb } from './db.js'
import { ensureSiteDefaults } from './seed/content.js'

await connectDb(env.mongoUri())
if (await ensureSiteDefaults()) console.log('Added the default categories, hero slides and settings.')

const server = createApp().listen(env.port, () => {
  console.log(`API listening on http://localhost:${env.port}`)
})

async function shutdown() {
  server.close()
  await disconnectDb()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
