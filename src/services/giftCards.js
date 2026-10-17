import { isValidObjectId } from 'mongoose'
import { GIFT_CARD_MAX, GIFT_CARD_MIN, GIFT_CARD_MONTHS, GIFT_CARD_PAYMENTS, GIFT_MESSAGE_MAX } from '../config/shop.js'
import { GiftCard } from '../models/GiftCard.js'
import { HttpError } from '../utils/httpError.js'
import { makeGiftCode, makeGiftReference } from '../utils/orderNumber.js'
import { normalizePhone, PHONE_ERROR } from '../utils/phone.js'
import { oneOf, optionalText, requiredText, validateInput, wholeNumber } from '../utils/validate.js'

// "gift 7kq2 mx4p" or "GIFT7KQ2MX4P" → "GIFT-7KQ2-MX4P"
export function normalizeCode(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('GIFT') ? raw.slice(4) : raw
  return /^[A-Z0-9]{8}$/.test(body) ? `GIFT-${body.slice(0, 4)}-${body.slice(4)}` : null
}

// pending (waiting for payment), active, used (nothing left), expired or cancelled.
export function stateOf(card, now = new Date()) {
  if (card.status !== 'active') return card.status
  if (card.expiresAt && card.expiresAt <= now) return 'expired'
  return card.balance > 0 ? 'active' : 'used'
}

const phoneRule = (required) => (v) => {
  if (!required && (v === undefined || v === null || v === '')) return { value: '' }
  const phone = normalizePhone(v)
  return phone ? { value: phone } : { error: PHONE_ERROR }
}

const RULES = {
  amount: (v) => {
    const r = wholeNumber(GIFT_CARD_MIN, GIFT_CARD_MAX, `Choose an amount from ৳${GIFT_CARD_MIN.toLocaleString('en-IN')} to ৳${GIFT_CARD_MAX.toLocaleString('en-IN')}.`)(v)
    return r.error || r.value % 100 === 0 ? r : { error: 'Use a round amount, e.g. 2,500.' }
  },
  buyerName: requiredText(2, 80, 'Please enter your name.'),
  buyerPhone: phoneRule(true),
  recipientName: requiredText(2, 80, "Please enter the recipient's name."),
  recipientPhone: phoneRule(false),
  message: optionalText(GIFT_MESSAGE_MAX),
  paymentMethod: oneOf(GIFT_CARD_PAYMENTS, 'Choose how you will pay.'),
  adminNote: optionalText(500),
}

function checkInput(body, required) {
  const { errors, value } = validateInput(body, RULES, { required })
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the gift card details.', { fields: errors })
  return value
}

async function createWithReference(doc) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await GiftCard.create({ ...doc, reference: makeGiftReference() })
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.reference) continue
      throw err
    }
  }
  throw new HttpError(503, 'Could not create the gift card. Please try again.')
}

// Gives a card its code and a year to be spent. Codes are random; on the rare clash, try again.
async function activate(card) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setMonth(expiresAt.getMonth() + GIFT_CARD_MONTHS)
    try {
      const updated = await GiftCard.findOneAndUpdate(
        { _id: card._id, status: 'pending' },
        { $set: { status: 'active', code: makeGiftCode(), 'payment.paid': true, activatedAt: now, expiresAt } },
        { returnDocument: 'after' },
      )
      if (!updated) throw new HttpError(409, 'This gift card was just changed by someone else. Please refresh.')
      return updated
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.code) continue
      throw err
    }
  }
  throw new HttpError(503, 'Could not make a code. Please try again.')
}

// ----- Shop -----

// A customer orders a card. It waits for payment; the admin activates it and sends the code.
export async function requestGiftCard(body, customer) {
  const input = { ...body }
  if (customer) {
    input.buyerName ??= customer.name
    input.buyerPhone ??= customer.phone
  }
  const v = checkInput(input, ['amount', 'buyerName', 'buyerPhone', 'recipientName', 'paymentMethod'])
  return createWithReference({
    amount: v.amount,
    balance: v.amount,
    buyer: { name: v.buyerName, phone: v.buyerPhone },
    recipient: { name: v.recipientName, phone: v.recipientPhone || undefined },
    message: v.message || undefined,
    payment: { method: v.paymentMethod, paid: false },
    customerId: customer?._id,
    createdBy: 'customer',
  })
}

// What a customer sees: the code only once the card is paid for.
export function toGiftCardJSON(card) {
  return {
    reference: card.reference,
    ...(card.status === 'active' ? { code: card.code } : {}),
    amount: card.amount,
    balance: card.balance,
    state: stateOf(card),
    recipient: { name: card.recipient?.name ?? '' },
    message: card.message ?? '',
    paymentMethod: card.payment?.method,
    createdAt: card.createdAt,
    expiresAt: card.expiresAt ?? null,
  }
}

const NOT_VALID = 'This gift card code is not valid. Check it and try again.'

// The usable card for a code, or a clear reason why not.
export async function findUsableCard(input) {
  const code = normalizeCode(input)
  const card = code && (await GiftCard.findOne({ code }))
  if (!card) throw new HttpError(404, NOT_VALID, { fields: { giftCard: NOT_VALID } })
  const state = stateOf(card)
  const reason = {
    used: 'This gift card has been fully used.',
    expired: 'This gift card has expired.',
    cancelled: NOT_VALID,
    pending: NOT_VALID,
  }[state]
  if (reason) throw new HttpError(409, reason, { fields: { giftCard: reason } })
  return card
}

export async function checkGiftCard(input) {
  const card = await findUsableCard(input)
  return { code: card.code, balance: card.balance, expiresAt: card.expiresAt }
}

// Takes `amount` off the card for an order, only if that much is still there.
export async function spendGiftCard(code, amount, order) {
  const updated = await GiftCard.findOneAndUpdate(
    { code, status: 'active', balance: { $gte: amount }, expiresAt: { $gt: new Date() } },
    { $inc: { balance: -amount }, $push: { uses: { order: order._id, orderNumber: order.orderNumber, amount } } },
    { returnDocument: 'after' },
  )
  if (!updated) {
    throw new HttpError(409, 'Your gift card balance has changed. Please check it again.', {
      code: 'GIFT_CARD_CHANGED',
      fields: { giftCard: 'The balance has changed. Please apply the card again.' },
    })
  }
  return updated
}

// A cancelled order (or one that failed to save) gives the amount back to the card.
export async function refundGiftCard(code, orderId) {
  const card = await GiftCard.findOne({ code })
  const use = card?.uses.find((u) => u.order?.equals(orderId) && !u.refunded)
  if (!use) return
  // Matching on "not refunded yet" means two cancellations can't refund twice.
  await GiftCard.updateOne(
    { _id: card._id, uses: { $elemMatch: { order: orderId, refunded: { $ne: true } } } },
    { $set: { 'uses.$.refunded': true }, $inc: { balance: use.amount } },
  )
}

// The order got a new number after a clash; keeps the card's history pointing at the right one.
export function renameGiftCardUse(code, orderId, orderNumber) {
  return GiftCard.updateOne({ code, 'uses.order': orderId }, { $set: { 'uses.$.orderNumber': orderNumber } })
}

export async function listCustomerGiftCards(customer) {
  const cards = await GiftCard.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(50)
  return cards.map(toGiftCardJSON)
}

// ----- Admin -----

export function toAdminGiftCardJSON(card) {
  const doc = card.toObject()
  return {
    id: String(doc._id),
    reference: doc.reference,
    code: doc.code ?? null,
    amount: doc.amount,
    balance: doc.balance,
    status: doc.status,
    state: stateOf(doc),
    buyer: doc.buyer,
    recipient: doc.recipient,
    message: doc.message ?? '',
    payment: doc.payment,
    createdBy: doc.createdBy,
    adminNote: doc.adminNote ?? '',
    customerId: doc.customerId ? String(doc.customerId) : null,
    createdAt: doc.createdAt,
    activatedAt: doc.activatedAt ?? null,
    expiresAt: doc.expiresAt ?? null,
    uses: (doc.uses ?? []).map(({ orderNumber, amount, at, refunded }) => ({ orderNumber, amount, at, refunded: Boolean(refunded) })),
    ...(doc.sample ? { sample: true } : {}),
  }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function listGiftCards({ status, q, page }) {
  const filter = {}
  if (['pending', 'active', 'cancelled'].includes(status)) filter.status = status
  const term = typeof q === 'string' ? q.trim().slice(0, 60) : ''
  if (term) {
    const code = normalizeCode(term)
    const digits = term.replace(/[\s+-]/g, '').replace(/^88/, '')
    if (code) filter.code = code
    else if (/^GC-?[A-Z0-9]{1,6}$/i.test(term)) filter.reference = { $regex: `^GC-${escapeRegex(term.toUpperCase().replace(/^GC-?/, ''))}` }
    else if (/^\d{3,}$/.test(digits)) filter.$or = [{ 'buyer.phone': { $regex: escapeRegex(digits) } }, { 'recipient.phone': { $regex: escapeRegex(digits) } }]
    else filter.$or = [{ 'buyer.name': { $regex: escapeRegex(term), $options: 'i' } }, { 'recipient.name': { $regex: escapeRegex(term), $options: 'i' } }]
  }
  const size = 30
  const pageNumber = Math.max(1, Math.min(1000, Number.parseInt(page, 10) || 1))
  const [cards, total, pending] = await Promise.all([
    GiftCard.find(filter).sort({ createdAt: -1 }).skip((pageNumber - 1) * size).limit(size),
    GiftCard.countDocuments(filter),
    GiftCard.countDocuments({ status: 'pending' }),
  ])
  return { giftCards: cards.map(toAdminGiftCardJSON), total, page: pageNumber, pages: Math.max(1, Math.ceil(total / size)), pending }
}

export const countPendingGiftCards = () => GiftCard.countDocuments({ status: 'pending' })

export async function getGiftCard(id) {
  const card = isValidObjectId(id) ? await GiftCard.findById(id) : null
  if (!card) throw new HttpError(404, 'Gift card not found.')
  return card
}

// A card sold in person or given away: created already paid and active.
export async function createGiftCardAsAdmin(body, admin) {
  const v = checkInput(body, ['amount', 'recipientName'])
  const card = await createWithReference({
    amount: v.amount,
    balance: v.amount,
    buyer: { name: v.buyerName || undefined, phone: v.buyerPhone || undefined },
    recipient: { name: v.recipientName, phone: v.recipientPhone || undefined },
    message: v.message || undefined,
    payment: { method: v.paymentMethod || 'cash', paid: true },
    createdBy: admin.email,
    adminNote: v.adminNote || undefined,
  })
  return activate(card)
}

// Payment received: the card gets its code.
export async function markGiftCardPaid(card) {
  if (card.status !== 'pending') throw new HttpError(409, 'Only a card waiting for payment can be activated.')
  return activate(card)
}

// A pending card, or an active one nobody has spent from yet.
export async function cancelGiftCard(card) {
  const filter = { _id: card._id, $or: [{ status: 'pending' }, { status: 'active', uses: { $size: 0 } }] }
  const updated = await GiftCard.findOneAndUpdate(filter, { $set: { status: 'cancelled' } }, { returnDocument: 'after' })
  if (!updated) throw new HttpError(409, 'This card has already been used, so it can no longer be cancelled.')
  return updated
}

export async function setGiftCardNote(card, note) {
  const r = optionalText(500)(note)
  if (r.error) throw new HttpError(400, r.error)
  card.adminNote = r.value || undefined
  await card.save()
  return card
}
