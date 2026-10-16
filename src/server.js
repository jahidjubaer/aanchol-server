import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDb, disconnectDb } from './db.js'

await connectDb(env.mongoUri())

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
