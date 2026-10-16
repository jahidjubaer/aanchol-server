import { ORDER_STATUSES, ORDER_TRANSITIONS } from '../config/shop.js'
import { Order } from '../models/Order.js'
import { HttpError } from '../utils/httpError.js'
import { releaseStock } from './orders.js'

const PAGE_SIZE = 20

export function toAdminJSON(order) {
  const doc = order.toObject()
  return {
    ...order.toJSON(),
    adminNote: doc.adminNote ?? '',
    statusHistory: doc.statusHistory,
    next: ORDER_TRANSITIONS[doc.status],
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

export async function listOrders({ status, q, page }) {
  const filter = { ...(typeof q === 'string' ? searchFilter(q) : {}) }
  if (ORDER_STATUSES.includes(status)) filter.status = status
  const pageNumber = Math.max(1, Math.min(1000, Number.parseInt(page, 10) || 1))

  const [orders, total, grouped] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE),
    Order.countDocuments(filter),
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ])

  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
  for (const g of grouped) counts[g._id] = g.n

  return {
    orders: orders.map(toAdminJSON),
    total,
    page: pageNumber,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts,
  }
}

export async function getOrder(orderNumber) {
  const order = await Order.findOne({ orderNumber: String(orderNumber).toUpperCase() })
  if (!order) throw new HttpError(404, 'Order not found.')
  return order
}

export async function updateOrder(orderNumber, { status, adminNote }, admin) {
  const order = await getOrder(orderNumber)
  const set = {}
  const update = { $set: set }

  if (adminNote !== undefined) {
    if (typeof adminNote !== 'string') throw new HttpError(400, 'Note must be text.')
    set.adminNote = adminNote.trim().slice(0, 1000)
  }

  if (status !== undefined && status !== order.status) {
    if (!ORDER_TRANSITIONS[order.status].includes(status)) {
      throw new HttpError(409, `An order that is ${order.status} can't be marked ${status}.`)
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
  }
  return updated
}
