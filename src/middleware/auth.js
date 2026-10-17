import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Admin } from '../models/Admin.js'
import { HttpError } from '../utils/httpError.js'

const TOKEN_LIFETIME = '7d'

export function signAdminToken(admin) {
  return jwt.sign({ sub: String(admin._id) }, env.jwtSecret(), { expiresIn: TOKEN_LIFETIME, algorithm: 'HS256' })
}

// Expects "Authorization: Bearer <token>". A bearer token (not a cookie) works across
// the shop's domain and the API's Render domain without third-party cookie problems.
export async function requireAdmin(req, _res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Please log in.')

  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret(), { algorithms: ['HS256'] })
  } catch {
    throw new HttpError(401, 'Your session has ended. Please log in again.')
  }
  // Customer logins are signed with the same secret, but never open the admin.
  if (payload.aud) throw new HttpError(401, 'Please log in.')
  const admin = mongoose.isValidObjectId(payload.sub) ? await Admin.findOne({ _id: payload.sub, active: true }) : null
  if (!admin) throw new HttpError(401, 'Please log in.')
  req.admin = admin
  next()
}
