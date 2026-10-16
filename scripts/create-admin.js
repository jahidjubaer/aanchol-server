// npm run create-admin  →  asks for email, name and password, then creates the admin
// in the database in MONGODB_URI. Running it again for the same email resets the password.
import { createInterface } from 'node:readline/promises'
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/db.js'
import { upsertAdmin } from '../src/seed/admins.js'

const rl = createInterface({ input: process.stdin, output: process.stdout })

// Prints * for each character typed, so the password isn't shown on screen.
async function askHidden(question) {
  const write = rl._writeToOutput.bind(rl)
  rl._writeToOutput = (s) => write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, '*'))
  const answer = await rl.question(question)
  rl._writeToOutput = write
  return answer
}

const email = await rl.question('Admin email: ')
const name = await rl.question('Name (shown in the admin): ')
const password = await askHidden('Password (10+ characters): ')
const repeat = await askHidden('Repeat password: ')
rl.close()

if (password !== repeat) {
  console.error('Passwords do not match.')
  process.exit(1)
}

await connectDb(env.mongoUri())
try {
  const admin = await upsertAdmin({ email, name, password })
  console.log(`Admin ready: ${admin.email}`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await disconnectDb()
}
