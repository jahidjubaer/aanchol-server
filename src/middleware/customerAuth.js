import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { Customer } from '../models/Customer.js'
import { HttpError } from '../utils/httpError.js'

const TOKEN_LIFETIME = '30d'
const AUDIENCE = 'customer' // keeps customer and admin logins apart (see requireAdmin)

export function signCustomerToken(customer) {
  return jwt.sign({ sub: String(customer._id), v: customer.tokenVersion }, env.jwtSecret(), {
    expiresIn: TOKEN_LIFETIME,
    algorithm: 'HS256',
    audience: AUDIENCE,
  })
}

async function customerFromRequest(req) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ')
  if (scheme !== 'Bearer' || !token) return null

  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret(), { algorithms: ['HS256'], audience: AUDIENCE })
  } catch {
    throw new HttpError(401, 'Your session has ended. Please sign in again.')
  }
  const customer = mongoose.isValidObjectId(payload.sub) ? await Customer.findOne({ _id: payload.sub, active: true }) : null
  if (!customer || customer.tokenVersion !== payload.v) throw new HttpError(401, 'Your session has ended. Please sign in again.')
  return customer
}

export async function requireCustomer(req, _res, next) {
  const customer = await customerFromRequest(req)
  if (!customer) throw new HttpError(401, 'Please sign in.')
  req.customer = customer
  next()
}

// Checkout works signed in or not; a signed-in order is linked to the account.
// An expired login never blocks an order: it's simply placed as a guest.
export async function optionalCustomer(req, _res, next) {
  req.customer = await customerFromRequest(req).catch(() => null)
  next()
}
