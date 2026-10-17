import { ORDER_STATUSES, ORDER_TRANSITIONS } from '../config/shop.js'
import { Order } from '../models/Order.js'
import { HttpError } from '../utils/httpError.js'
import { refundGiftCard } from './giftCards.js'
import { releaseStock } from './orders.js'

const PAGE_SIZE = 20

export function toAdminJSON(order) {
  const doc = order.toObject()
  return {
    ...order.toJSON(),
    adminNote: doc.adminNote ?? '',
    statusHistory: doc.statusHistory,
    next: ORDER_TRANSITIONS[doc.status],
    paymentToCheck: paymentToCheck(doc),
    ...(doc.payment?.verifiedBy ? { paymentVerifiedBy: doc.payment.verifiedBy } : {}),
    ...(doc.customerId ? { customerId: String(doc.customerId) } : {}),
    ...(doc.sample ? { sample: true } : {}),
  }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Search by order number (AN-XXXXXX, or the start of one), phone digits, or customer name.
function searchFilter(q) {
  const term = q.trim().slice(0, 60)
  if (!term) return {}
  if (/^AN-[A-Z0-9]{1,6}$/i.test(term)) {
    const code = term.toUpperCase().slice(3)
    return { orderNumber: { $regex: `^AN-${escapeRegex(code)}` } }
  }
  const digits = term.replace(/[\s+-]/g, '')
  if (/^\d{3,}$/.test(digits)) return { 'customer.phone': { $regex: escapeRegex(digits.replace(/^88/, '')) } }
  return { 'customer.name': { $regex: escapeRegex(term), $options: 'i' } }
}

// New orders whose bKash/Nagad advance hasn't been checked yet.
const TO_CHECK = { status: 'pending', 'payment.advance': { $gt: 0 }, 'payment.verified': { $ne: true } }
export const countPaymentsToCheck = () => Order.countDocuments(TO_CHECK)

export async function listOrders({ status, q, page }) {
  const filter = { ...(typeof q === 'string' ? searchFilter(q) : {}) }
  if (ORDER_STATUSES.includes(status)) filter.status = status
  if (status === 'payment') Object.assign(filter, TO_CHECK)
  const pageNumber = Math.max(1, Math.min(1000, Number.parseInt(page, 10) || 1))

  const [orders, total, grouped, toCheck] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    countPaymentsToCheck(),
  ])

  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
  for (const g of grouped) counts[g._id] = g.n

  return {
    orders: orders.map(toAdminJSON),
    total,
    page: pageNumber,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: { ...counts, payment: toCheck },
  }
}

export async function getOrder(orderNumber) {
  const order = await Order.findOne({ orderNumber: String(orderNumber).toUpperCase() })
  if (!order) throw new HttpError(404, 'Order not found.')
  return order
}

// Whether the advance still has to be checked before the order can be confirmed.
export const paymentToCheck = (order) => order.payment?.advance > 0 && !order.payment.verified

export async function updateOrder(orderNumber, { status, adminNote, paymentVerified }, admin) {
  const order = await getOrder(orderNumber)
  const set = {}
  const update = { $set: set }

  // The admin found the bKash/Nagad payment (TrxID) in the shop's account.
  if (paymentVerified !== undefined) {
    if (paymentVerified !== true) throw new HttpError(400, 'Send paymentVerified: true.')
    if (!paymentToCheck(order)) throw new HttpError(409, 'There is no payment to check on this order.')
    if (order.status === 'cancelled') throw new HttpError(409, 'This order was cancelled.')
    set['payment.verified'] = true
    set['payment.verifiedAt'] = new Date()
    set['payment.verifiedBy'] = admin.email
    if (order.payment.plan === 'full') set['payment.paid'] = true
  }

  if (adminNote !== undefined) {
    if (typeof adminNote !== 'string') throw new HttpError(400, 'Note must be text.')
    set.adminNote = adminNote.trim().slice(0, 1000)
  }

  if (status !== undefined && status !== order.status) {
    if (!ORDER_TRANSITIONS[order.status].includes(status)) {
      throw new HttpError(409, `An order that is ${order.status} can't be marked ${status}.`)
    }
    if (status === 'confirmed' && paymentToCheck(order) && paymentVerified !== true) {
      throw new HttpError(409, `Check the ${order.payment.method === 'bkash' ? 'bKash' : 'Nagad'} payment (TrxID ${order.payment.trxId}) before confirming.`)
    }
    set.status = status
    if (status === 'delivered') set['payment.paid'] = true // cash on delivery is collected on handover
    update.$push = { statusHistory: { status, at: new Date(), by: admin.email } }
  }

  if (!Object.keys(set).length) return order

  // Only applies if nobody changed the status in the meantime (e.g. two tabs cancelling at once).
  const updated = await Order.findOneAndUpdate({ _id: order._id, status: order.status }, update, { returnDocument: 'after' })
  if (!updated) throw new HttpError(409, 'This order was just changed by someone else. Please refresh.')

  if (set.status === 'cancelled') {
    await releaseStock(order.items.map((i) => ({ product: { _id: i.product }, qty: i.qty })))
    if (order.giftCard?.code) await refundGiftCard(order.giftCard.code, order._id)
  }
  return updated
}
