import { createHash, randomBytes } from 'node:crypto'
import { isValidObjectId } from 'mongoose'
import { MAX_ADDRESSES, MAX_WISHLIST, MIN_PASSWORD, RESET_LINK_HOURS } from '../config/shop.js'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { HttpError } from '../utils/httpError.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { normalizeLoginPhone, normalizePhone, PHONE_ERROR } from '../utils/phone.js'
import { optionalText, requiredText } from '../utils/validate.js'

// Compared against when the number has no account, so both cases take the same time.
const DUMMY_HASH = '00000000000000000000000000000000:' + '0'.repeat(128)
const SLUG = /^[a-z0-9-]{1,80}$/

const fail = (fields, message = 'Please check your details.') => {
  throw new HttpError(400, message, { fields })
}

function checkPassword(password, field = 'password') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return { [field]: `Use at least ${MIN_PASSWORD} characters.` }
  if (password.length > 200) return { [field]: 'That password is too long.' }
  return null
}

function checkEmail(email) {
  const result = optionalText(120)(email)
  if (result.error) return { error: result.error }
  const value = result.value.toLowerCase()
  if (value && !/^\S+@\S+\.\S+$/.test(value)) return { error: 'Enter a valid email or leave it empty.' }
  return { value }
}

export async function register({ name, phone, password }) {
  const fields = {}
  const nameResult = requiredText(2, 80, 'Please enter your full name.')(name)
  if (nameResult.error) fields.name = nameResult.error
  const normalized = normalizePhone(phone)
  if (!normalized) fields.phone = PHONE_ERROR
  Object.assign(fields, checkPassword(password))
  if (Object.keys(fields).length) fail(fields)

  if (await Customer.exists({ phone: normalized })) {
    throw new HttpError(409, 'Please check your details.', {
      fields: { phone: 'This number already has an account. Sign in instead, or reset your password.' },
    })
  }
  try {
    return await Customer.create({ name: nameResult.value, phone: normalized, passwordHash: await hashPassword(password), lastLoginAt: new Date() })
  } catch (err) {
    if (err?.code === 11000) throw new HttpError(409, 'This number already has an account.', { fields: { phone: 'This number already has an account.' } })
    throw err
  }
}

export async function login({ phone, password }) {
  const normalized = normalizeLoginPhone(phone)
  if (!normalized || typeof password !== 'string' || !password) throw new HttpError(400, 'Please enter your mobile number and password.')
  const customer = await Customer.findOne({ phone: normalized })
  const ok = await verifyPassword(password, customer?.passwordHash ?? DUMMY_HASH)
  if (!customer || !ok) throw new HttpError(401, 'Mobile number or password is incorrect.')
  if (!customer.active) throw new HttpError(403, 'This account is paused. Please contact us on WhatsApp.')
  customer.lastLoginAt = new Date()
  await customer.save()
  return customer
}

export async function updateProfile(customer, body) {
  const fields = {}
  const set = {}
  if (body?.name !== undefined) {
    const r = requiredText(2, 80, 'Please enter your full name.')(body.name)
    if (r.error) fields.name = r.error
    else set.name = r.value
  }
  if (body?.email !== undefined) {
    const r = checkEmail(body.email)
    if (r.error) fields.email = r.error
    else set.email = r.value
  }
  if (Object.keys(fields).length) fail(fields)
  return Customer.findByIdAndUpdate(customer._id, { $set: set }, { returnDocument: 'after' })
}

export async function changePassword(customer, { current, password }) {
  if (!(await verifyPassword(String(current ?? ''), customer.passwordHash))) fail({ current: 'Your current password is not right.' })
  const problem = checkPassword(password)
  if (problem) fail(problem)
  // Other devices are signed out; the caller gets a fresh login.
  return Customer.findByIdAndUpdate(
    customer._id,
    { $set: { passwordHash: await hashPassword(password) }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  )
}

// ----- Addresses -----

function validateAddress(body) {
  const fields = {}
  const value = {}
  const rules = {
    label: optionalText(30),
    name: requiredText(2, 80, 'Please enter the name for delivery.'),
    city: requiredText(1, 60, 'Please enter the city or district.'),
    address: requiredText(8, 300, 'Please enter the full address.'),
  }
  for (const [key, rule] of Object.entries(rules)) {
    const r = rule(body?.[key])
    if (r.error) fields[key] = r.error
    else value[key] = r.value
  }
  const phone = normalizePhone(body?.phone)
  if (!phone) fields.phone = PHONE_ERROR
  else value.phone = phone
  if (Object.keys(fields).length) fail(fields, 'Please check the address.')
  return value
}

export async function addAddress(customer, body) {
  const value = validateAddress(body)
  if (customer.addresses.length >= MAX_ADDRESSES) throw new HttpError(409, `Up to ${MAX_ADDRESSES} addresses. Remove one first.`)
  customer.addresses.push(value)
  const added = customer.addresses.at(-1)
  if (!customer.defaultAddress || body?.makeDefault) customer.defaultAddress = added._id
  await customer.save()
  return customer
}

export async function updateAddress(customer, id, body) {
  const address = isValidObjectId(id) ? customer.addresses.id(id) : null
  if (!address) throw new HttpError(404, 'Address not found.')
  address.set(validateAddress(body))
  if (body?.makeDefault) customer.defaultAddress = address._id
  await customer.save()
  return customer
}

export async function removeAddress(customer, id) {
  const address = isValidObjectId(id) ? customer.addresses.id(id) : null
  if (!address) throw new HttpError(404, 'Address not found.')
  address.deleteOne()
  if (String(customer.defaultAddress) === String(id)) customer.defaultAddress = customer.addresses[0]?._id
  await customer.save()
  return customer
}

// ----- Wishlist -----

function cleanSlugs(list) {
  if (!Array.isArray(list) || !list.every((s) => typeof s === 'string' && SLUG.test(s))) {
    throw new HttpError(400, 'Your wishlist has an invalid item.')
  }
  return [...new Set(list)].slice(0, MAX_WISHLIST)
}

export async function setWishlist(customer, list) {
  customer.wishlist = cleanSlugs(list)
  await customer.save()
  return customer.wishlist
}

// After signing in: what was saved on this device is added to the account (newest first).
export async function mergeWishlist(customer, list) {
  customer.wishlist = cleanSlugs([...cleanSlugs(list), ...customer.wishlist])
  await customer.save()
  return customer.wishlist
}

// ----- Orders -----

// What a customer sees about their order: no admin notes or who changed what.
export function toCustomerOrderJSON(order) {
  const doc = order.toObject()
  return {
    ...order.toJSON(),
    placedAt: doc.createdAt,
    timeline: (doc.statusHistory ?? []).map(({ status, at }) => ({ status, at })),
  }
}

export async function listCustomerOrders(customer) {
  const orders = await Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(100)
  return orders.map(toCustomerOrderJSON)
}

export async function getCustomerOrder(customer, orderNumber) {
  const order = await Order.findOne({ orderNumber: String(orderNumber).toUpperCase(), customerId: customer._id })
  if (!order) throw new HttpError(404, 'Order not found.')
  return toCustomerOrderJSON(order)
}

// A guest order joins the account when the customer knows its number and it was placed with
// the same phone. Phones aren't SMS-verified, so orders are never linked by phone alone.
export async function claimOrder(customer, orderNumber) {
  const number = String(orderNumber ?? '').trim().toUpperCase()
  if (!/^AN-[A-Z0-9]{6}$/.test(number)) fail({ orderNumber: 'Enter the order number, e.g. AN-7KQ2MX.' })
  const order = await Order.findOne({ orderNumber: number, 'customer.phone': customer.phone })
  if (!order) fail({ orderNumber: 'No order with this number was placed with your mobile number.' })
  if (order.customerId && !order.customerId.equals(customer._id)) fail({ orderNumber: 'This order belongs to another account.' })
  order.customerId = customer._id
  await order.save()
  return toCustomerOrderJSON(order)
}

// ----- Password reset (the admin creates a one-time link and sends it on WhatsApp) -----

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export async function createResetToken(customer) {
  const token = randomBytes(24).toString('base64url')
  customer.resetTokenHash = hashToken(token)
  customer.resetExpires = new Date(Date.now() + RESET_LINK_HOURS * 60 * 60 * 1000)
  await customer.save()
  return { token, expiresAt: customer.resetExpires }
}

export async function resetPassword({ token, password }) {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(400, 'This reset link is not valid.')
  const problem = checkPassword(password)
  if (problem) fail(problem)
  const customer = await Customer.findOneAndUpdate(
    { resetTokenHash: hashToken(token), resetExpires: { $gt: new Date() }, active: true },
    { $set: { passwordHash: await hashPassword(password), lastLoginAt: new Date() }, $unset: { resetTokenHash: 1, resetExpires: 1 }, $inc: { tokenVersion: 1 } },
    { returnDocument: 'after' },
  )
  if (!customer) throw new HttpError(400, 'This reset link has expired or was already used. Please ask us for a new one.')
  return customer
}

// ----- Admin -----

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function toAdminCustomerJSON(customer, extra = {}) {
  const doc = customer.toObject()
  return {
    id: String(doc._id),
    ...customer.toJSON(),
    active: doc.active,
    lastLoginAt: doc.lastLoginAt,
    wishlistCount: doc.wishlist?.length ?? 0,
    resetPending: Boolean(doc.resetExpires && doc.resetExpires > new Date()),
    ...(doc.sample ? { sample: true } : {}),
    ...extra,
  }
}

export async function listCustomers({ q, page }) {
  const term = typeof q === 'string' ? q.trim().slice(0, 60) : ''
  const digits = term.replace(/[\s+-]/g, '').replace(/^88/, '')
  const filter = !term ? {} : /^\d{3,}$/.test(digits) ? { phone: { $regex: escapeRegex(digits) } } : { name: { $regex: escapeRegex(term), $options: 'i' } }
  const size = 30
  const pageNumber = Math.max(1, Math.min(1000, Number.parseInt(page, 10) || 1))
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip((pageNumber - 1) * size).limit(size),
    Customer.countDocuments(filter),
  ])
  const counts = await Order.aggregate([
    { $match: { customerId: { $in: customers.map((c) => c._id) } } },
    { $group: { _id: '$customerId', n: { $sum: 1 } } },
  ])
  const countOf = (id) => counts.find((c) => c._id.equals(id))?.n ?? 0
  return {
    customers: customers.map((c) => toAdminCustomerJSON(c, { orderCount: countOf(c._id) })),
    total,
    page: pageNumber,
    pages: Math.max(1, Math.ceil(total / size)),
  }
}

export async function getCustomerById(id) {
  const customer = isValidObjectId(id) ? await Customer.findById(id) : null
  if (!customer) throw new HttpError(404, 'Customer not found.')
  return customer
}

export async function setCustomerActive(customer, active) {
  if (typeof active !== 'boolean') throw new HttpError(400, 'Must be on or off.')
  return Customer.findByIdAndUpdate(customer._id, { $set: { active }, ...(active ? {} : { $inc: { tokenVersion: 1 } }) }, { returnDocument: 'after' })
}
