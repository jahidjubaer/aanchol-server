import { DELIVERY_OPTIONS, GIFT_MESSAGE_MAX, MAX_LINES_PER_ORDER, MAX_QTY_PER_LINE, MOBILE_WALLETS, PAYMENT_PLANS } from '../config/shop.js'
import { normalizePhone, PHONE_ERROR } from './phone.js'

// Same rules as client/src/utils/checkout.js, plus the checks a browser can't be trusted with.
const SLUG = /^[a-z0-9-]{1,80}$/

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function validateOrderInput(body) {
  const errors = {}
  const input = isObject(body) ? body : {}
  const c = isObject(input.customer) ? input.customer : {}

  const customer = {
    name: text(c.name, 80),
    phone: text(c.phone, 20).replace(/[\s-]/g, ''),
    email: text(c.email, 120).toLowerCase(),
    city: text(c.city, 60),
    address: text(c.address, 300),
    note: text(c.note, 500),
  }

  if (customer.name.length < 2) errors.name = 'Please enter your full name.'
  const phone = normalizePhone(customer.phone)
  if (phone) customer.phone = phone // stored as 01XXXXXXXXX
  else errors.phone = PHONE_ERROR
  if (customer.email && !/^\S+@\S+\.\S+$/.test(customer.email)) errors.email = 'Enter a valid email or leave it empty.'
  if (!customer.city) errors.city = 'Please enter your city or district.'
  if (customer.address.length < 8) errors.address = 'Please enter your full delivery address.'

  const delivery = DELIVERY_OPTIONS.find((d) => d.id === input.delivery)
  if (!delivery) errors.delivery = 'Please choose a delivery option.'

  // Lines for the same sari are merged, so one item can't slip past the stock check twice.
  const merged = new Map()
  for (const item of Array.isArray(input.items) ? input.items : []) {
    const qty = Number(item?.qty)
    if (typeof item?.slug !== 'string' || !SLUG.test(item.slug) || !Number.isInteger(qty) || qty < 1) {
      errors.items = 'Your bag has an invalid item. Please refresh and try again.'
      break
    }
    merged.set(item.slug, (merged.get(item.slug) ?? 0) + qty)
  }
  const items = [...merged].map(([slug, qty]) => ({ slug, qty }))
  if (!errors.items) {
    if (items.length === 0) errors.items = 'Your bag is empty.'
    else if (items.length > MAX_LINES_PER_ORDER || items.some((i) => i.qty > MAX_QTY_PER_LINE))
      errors.items = 'That is more than we can take in one order. Please contact us on WhatsApp.'
  }

  // The subtotal the customer saw. Optional, so older pages still work.
  let expectedSubtotal
  if (input.expectedSubtotal !== undefined) {
    if (Number.isInteger(input.expectedSubtotal) && input.expectedSubtotal >= 0) expectedSubtotal = input.expectedSubtotal
    else errors.items = 'Your bag has an invalid total. Please refresh and try again.'
  }

  // The total before any gift card, as checkout showed it (member discount, delivery and gift wrap included).
  let expectedTotal
  if (input.expectedTotal !== undefined) {
    if (Number.isInteger(input.expectedTotal) && input.expectedTotal >= 0) expectedTotal = input.expectedTotal
    else errors.items = 'Your bag has an invalid total. Please refresh and try again.'
  }

  // { message } to gift wrap the order; the message goes on a card inside.
  let giftWrap
  if (input.giftWrap) {
    const message = isObject(input.giftWrap) ? (input.giftWrap.message ?? '') : null
    if (typeof message !== 'string') errors.giftWrap = 'Please check the gift message.'
    else if (message.trim().length > GIFT_MESSAGE_MAX) errors.giftWrap = `Keep the message under ${GIFT_MESSAGE_MAX} characters.`
    else giftWrap = { message: message.trim() }
  }

  let giftCardCode
  if (input.giftCard !== undefined && input.giftCard !== '' && input.giftCard !== null) {
    if (typeof input.giftCard === 'string' && input.giftCard.length <= 30) giftCardCode = input.giftCard
    else errors.giftCard = 'This gift card code is not valid. Check it and try again.'
  }

  // { method: 'bkash' | 'nagad', plan: 'advance' | 'full', trxId, sender, amount } — the advance sent by
  // Send Money. Whether it's needed (and how much) is decided in services/orders.js.
  let payment
  if (input.payment !== undefined && input.payment !== null) {
    const p = isObject(input.payment) ? input.payment : {}
    payment = {
      method: MOBILE_WALLETS.includes(p.method) ? p.method : null,
      plan: PAYMENT_PLANS.includes(p.plan) ? p.plan : null,
      trxId: text(p.trxId, 30).toUpperCase().replace(/[\s-]/g, ''),
      sender: normalizePhone(text(p.sender, 20)),
      amount: Number.isInteger(p.amount) ? p.amount : undefined,
    }
    if (!payment.method) errors.paymentMethod = 'Choose bKash or Nagad.'
    if (!payment.plan) errors.paymentPlan = 'Choose how much to pay now.'
    if (!/^[A-Z0-9]{8,12}$/.test(payment.trxId)) errors.trxId = 'Enter the transaction ID from your payment message, e.g. 8N7A6B5C4D.'
    if (!payment.sender) errors.sender = 'Enter the number you sent the money from.'
  }

  return { errors, value: { customer, delivery, items, expectedSubtotal, expectedTotal, giftWrap, giftCardCode, payment } }
}
