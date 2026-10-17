// Prices and fees are decided here, never trusted from the browser.
// Keep in sync with client/src/config/brand.js (DELIVERY_OPTIONS).
export const DELIVERY_OPTIONS = [
  { id: 'inside-dhaka', label: 'Inside Dhaka', eta: '1–2 days', fee: 0 },
  { id: 'outside-dhaka', label: 'Outside Dhaka', eta: '2–5 days', fee: 150 },
]

// Cash on delivery, with an advance sent by bKash or Nagad "Send Money" to the shop's own number
// (no payment gateway). To confirm an order the customer pays at least the delivery charge,
// or minAdvance when delivery is free, or the whole amount. The admin checks each payment by hand.
export const PAYMENT_METHODS = ['cod', 'bkash', 'nagad']
export const MOBILE_WALLETS = ['bkash', 'nagad']
export const PAYMENT_PLANS = ['advance', 'full']
// Off until the admin enters the numbers; until then orders are plain cash on delivery.
export const DEFAULT_PAYMENTS = { bkash: { enabled: false, number: '' }, nagad: { enabled: false, number: '' }, minAdvance: 120 }

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

// Membership: a level is reached by what a customer has spent on delivered orders, all time
// (goods only, after discounts; delivery and gift wrap don't count). The admin can edit the levels.
// The member discount comes off the sale price during a campaign.
export const DEFAULT_MEMBER_TIERS = [
  { name: 'Silver', min: 5000, percent: 3 },
  { name: 'Gold', min: 10000, percent: 5 },
  { name: 'Platinum', min: 20000, percent: 8 },
  { name: 'Diamond', min: 30000, percent: 12 },
]
export const MAX_MEMBER_TIERS = 6
export const MAX_MEMBER_PERCENT = 20 // anything above is almost certainly a typo

// Gift wrap with a handwritten message. The admin sets the fee or switches it off.
export const DEFAULT_GIFT_WRAP = { enabled: true, fee: 100 }
export const GIFT_MESSAGE_MAX = 200

// Gift cards are ordered online and paid by bKash or cash; the admin activates them once paid.
export const GIFT_CARD_MIN = 500
export const GIFT_CARD_MAX = 50000
export const GIFT_CARD_AMOUNTS = [1000, 2000, 3000, 5000, 10000]
export const GIFT_CARD_MONTHS = 12 // valid for a year from activation
export const GIFT_CARD_PAYMENTS = ['bkash', 'nagad', 'cash']

// "Complete the look": pieces the admin pairs with a product.
export const MAX_PAIRS = 6
