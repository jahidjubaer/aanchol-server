import { DELIVERY_OPTIONS, MAX_LINES_PER_ORDER, MAX_QTY_PER_LINE } from '../config/shop.js'

// Same rules as client/src/utils/checkout.js, plus the checks a browser can't be trusted with.
const BD_PHONE = /^(?:\+?88)?(01[3-9]\d{8})$/
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
  const phoneMatch = customer.phone.match(BD_PHONE)
  if (phoneMatch) customer.phone = phoneMatch[1] // stored as 01XXXXXXXXX
  else errors.phone = 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.'
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

  return { errors, value: { customer, delivery, items, expectedSubtotal } }
}
