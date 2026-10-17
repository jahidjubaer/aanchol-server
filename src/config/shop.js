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

// Product categories live in the database (models/Category.js) and are managed in the admin.
export const CATEGORY_STATUSES = ['live', 'coming-soon', 'hidden']
// saree: the product form shows fabric, thread count, weaver. general: free-form detail rows instead.
export const CATEGORY_TEMPLATES = ['saree', 'general']
export const MAX_CATEGORY_TYPES = 12

export const MAX_PRODUCT_IMAGES = 8
export const MAX_PRODUCT_DETAILS = 10

// Home page sections after the hero, in their default order. The admin can reorder and hide them.
export const HOME_SECTIONS = [
  { id: 'promise-strip', label: 'Promise strip (delivery, COD, handwoven)' },
  { id: 'featured', label: 'New from the loom (latest products)' },
  { id: 'categories', label: 'Shop by craft (categories)' },
  { id: 'craft', label: 'Craft story' },
  { id: 'promises', label: 'Our promises' },
]
export const MAX_ANNOUNCEMENTS = 3
export const MAX_HERO_SLIDES = 8

// A campaign can take at most this much off. Anything bigger is almost certainly a typo.
export const MAX_PERCENT_OFF = 70

// Customer accounts
export const MIN_PASSWORD = 8
export const MAX_ADDRESSES = 5
export const MAX_WISHLIST = 100
export const RESET_LINK_HOURS = 24
