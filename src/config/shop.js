// Prices and fees are decided here, never trusted from the browser.
// Keep in sync with client/src/config/brand.js (DELIVERY_OPTIONS).
export const DELIVERY_OPTIONS = [
  { id: 'inside-dhaka', label: 'Inside Dhaka', eta: '1–2 days', fee: 0 },
  { id: 'outside-dhaka', label: 'Outside Dhaka', eta: '2–5 days', fee: 150 },
]

export const PAYMENT_METHODS = ['cod']

export const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

// Which status an order may move to next. Delivered and cancelled are final.
export const ORDER_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export const MAX_LINES_PER_ORDER = 10
export const MAX_QTY_PER_LINE = 5

// Product categories the admin can choose. Keep in sync with client/src/data/collections.js.
export const PRODUCT_CATEGORIES = ['jamdani', 'jewellery']
export const MAX_PRODUCT_IMAGES = 8
