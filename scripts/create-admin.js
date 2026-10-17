// npm run create-admin  →  asks for email, name and password, then creates the admin
// in the database in MONGODB_URI. Running it again for the same email resets the password.
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { env } from '../src/config/env.js'
import { connectDb, disconnectDb } from '../src/db.js'
import { upsertAdmin } from '../src/seed/admins.js'

// Output goes through this stream so typing can be hidden while a password is entered.
let hidden = false
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding)
    done()
  },
})

const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) })

async function ask(question) {
  process.stdout.write(question)
  return rl.question('')
}

// Nothing is shown on screen while the password is typed.
async function askHidden(question) {
  process.stdout.write(`${question}(hidden) `)
  hidden = true
  try {
    return await rl.question('')
  } finally {
    hidden = false
    process.stdout.write('\n')
  }
}

const email = (await ask('Admin email: ')).trim()
const name = (await ask('Name (shown in the admin): ')).trim()
const password = await askHidden('Password, 10+ characters ')
const repeat = await askHidden('Repeat password ')
rl.close()

if (password !== repeat) {
  console.error('Passwords do not match. Nothing was saved, please run it again.')
  process.exit(1)
}
if (password.length < 10) {
  console.error(`Password is ${password.length} characters; it needs at least 10. Nothing was saved.`)
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
