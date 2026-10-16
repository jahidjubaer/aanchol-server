import { Admin } from '../models/Admin.js'
import { hashPassword } from '../utils/password.js'

// Creates the admin, or resets the name and password if the email already exists.
export async function upsertAdmin({ email, name, password }) {
  if (!/^\S+@\S+\.\S+$/.test(email ?? '')) throw new Error('Enter a valid email.')
  if ((password ?? '').length < 10) throw new Error('Password must be at least 10 characters.')
  const passwordHash = await hashPassword(password)
  return Admin.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { $set: { name: name?.trim() || 'Admin', passwordHash, active: true } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
}
