import { randomBytes } from 'node:crypto'
import { Campaign } from '../models/Campaign.js'
import { Category } from '../models/Category.js'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { SiteSettings } from '../models/SiteSettings.js'
import { hashPassword } from '../utils/password.js'
import { makeOrderNumber } from '../utils/orderNumber.js'
import { ensureDefaultCategories } from './content.js'

// Demo data so every page has something to show while real products are being photographed.
// Everything here is marked sample: true and removed by removeSampleData(). Phone numbers use
// the 011 range, which has no operator in Bangladesh, so they can never belong to a real person.

const IMG = '/images/placeholder'
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(Date.now() - n * DAY)

export const SAMPLE_CUSTOMER_PHONE = '01100000001'

const jamdani = (p) => ({ category: 'jamdani', origin: 'Tangail', ...p })
const jewellery = (p) => ({ category: 'jewellery', origin: 'Bangladesh', ...p })

export const sampleProducts = [
  jamdani({
    slug: 'sample-shada-paar-jamdani',
    name: 'Shada Paar Jamdani',
    nameBangla: 'সাদা পাড় জামদানি',
    fabric: 'Cotton',
    count: 84,
    color: 'White',
    price: 9800,
    badge: 'Sample',
    images: [`${IMG}/jamdani-ash-red-detail.jpg`],
    colors: { base: '#f3ebdd', motif: '#7a1f2b' },
    description: 'Sample product. Off-white cotton with a narrow red woven border, light enough for everyday wear.',
    weavingTime: 'About 3 weeks',
    weaver: 'Weaving cooperative, Tangail',
    stock: 3,
    addedOn: daysAgo(2),
  }),
  jamdani({
    slug: 'sample-golden-jhalor-jamdani',
    name: 'Golden Jhalor Jamdani',
    nameBangla: 'সোনালি ঝালর জামদানি',
    fabric: 'Half-silk',
    count: 100,
    color: 'Yellow',
    price: 15600,
    compareAt: 17200,
    badge: 'Sample',
    images: [`${IMG}/jamdani-yellow.jpg`, `${IMG}/jamdani-red-on-loom.jpg`],
    colors: { base: '#c99a2e', motif: '#7a1f2b' },
    description: 'Sample product. Golden half-silk with a deep jhalor (fringe) border and maroon butis.',
    weavingTime: 'About 6 weeks',
    weaver: 'Master weaver family, Pathrail, Tangail',
    stock: 1,
    addedOn: daysAgo(4),
  }),
  jamdani({
    slug: 'sample-nil-akash-jamdani',
    name: 'Nil Akash Jamdani',
    nameBangla: 'নীল আকাশ জামদানি',
    fabric: 'Silk',
    count: 120,
    color: 'Blue',
    price: 26500,
    badge: 'Sample',
    images: [],
    colors: { base: '#2f4f7a', motif: '#e6c77d' },
    description: 'Sample product. Sky-blue silk with a scattering of gold tara butis and a broad anchal.',
    weavingTime: 'About 11 weeks',
    weaver: 'Master weaver family, Pathrail, Tangail',
    stock: 0,
    addedOn: daysAgo(20),
  }),
  jewellery({
    slug: 'sample-mango-wood-jhumka',
    name: 'Mango Wood Jhumka',
    nameBangla: 'কাঠের ঝুমকা',
    type: 'wood',
    color: 'Brown',
    price: 1450,
    badge: 'Sample',
    images: [],
    colors: { base: '#6b4a2b', motif: '#d9b56a' },
    details: [
      { label: 'Material', value: 'Mango wood, brass hooks' },
      { label: 'Length', value: '5 cm' },
      { label: 'Weight', value: 'Very light, about 6 g each' },
    ],
    description: 'Sample product. Hand-turned mango wood jhumkas with a soft oiled finish.',
    stock: 6,
    addedOn: daysAgo(1),
  }),
  jewellery({
    slug: 'sample-shapla-carved-pendant',
    name: 'Shapla Carved Pendant',
    nameBangla: 'শাপলা লকেট',
    type: 'carved',
    color: 'Natural',
    price: 2200,
    badge: 'Sample',
    images: [],
    colors: { base: '#a07850', motif: '#faf6ee' },
    details: [
      { label: 'Material', value: 'Rosewood, cotton cord' },
      { label: 'Pendant', value: '4 × 4 cm' },
      { label: 'Cord', value: 'Adjustable, 40–70 cm' },
    ],
    description: 'Sample product. A shapla (water lily) hand-carved in rosewood, the national flower of Bangladesh.',
    stock: 4,
    addedOn: daysAgo(3),
  }),
  jewellery({
    slug: 'sample-terracotta-bala-set',
    name: 'Terracotta Bala Set',
    nameBangla: 'পোড়ামাটির বালা',
    type: 'handmade',
    color: 'Red',
    price: 1850,
    compareAt: 2100,
    badge: 'Sample',
    images: [],
    colors: { base: '#9c4a2f', motif: '#2b1d16' },
    details: [
      { label: 'Material', value: 'Hand-painted terracotta' },
      { label: 'Set', value: '4 bangles' },
      { label: 'Size', value: '2.4 and 2.6 available' },
    ],
    description: 'Sample product. Four terracotta bangles painted with alpona motifs.',
    stock: 5,
    addedOn: daysAgo(6),
  }),
  jewellery({
    slug: 'sample-kodom-wood-earrings',
    name: 'Kodom Flower Earrings',
    nameBangla: 'কদম ফুল দুল',
    type: 'carved',
    color: 'Black',
    price: 1250,
    badge: 'Sample',
    images: [],
    colors: { base: '#2b1d16', motif: '#e2b520' },
    details: [
      { label: 'Material', value: 'Ebony-stained wood' },
      { label: 'Diameter', value: '3 cm' },
    ],
    description: 'Sample product. Round studs carved like a kodom flower, with a touch of gold paint.',
    stock: 0,
    addedOn: daysAgo(12),
  }),
]

const delivery = (inside) =>
  inside
    ? { id: 'inside-dhaka', label: 'Inside Dhaka', eta: '1–2 days', fee: 0 }
    : { id: 'outside-dhaka', label: 'Outside Dhaka', eta: '2–5 days', fee: 150 }

const HISTORY = {
  pending: ['pending'],
  confirmed: ['pending', 'confirmed'],
  shipped: ['pending', 'confirmed', 'shipped'],
  delivered: ['pending', 'confirmed', 'shipped', 'delivered'],
  cancelled: ['pending', 'cancelled'],
}

function sampleOrder({ customer, items, status, days, inside = true, customerId, note }) {
  const placed = daysAgo(days)
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const fee = delivery(inside).fee
  return {
    orderNumber: makeOrderNumber(),
    items,
    subtotal,
    delivery: delivery(inside),
    total: subtotal + fee,
    payment: { method: 'cod', paid: status === 'delivered' },
    customer: { ...customer, ...(note ? { note } : {}) },
    status,
    statusHistory: HISTORY[status].map((s, i) => ({ status: s, at: new Date(placed.getTime() + i * 0.6 * DAY), by: i ? 'sample' : 'customer' })),
    ...(customerId ? { customerId } : {}),
    sample: true,
    createdAt: placed,
    updatedAt: placed,
  }
}

// Adds (or refreshes) the sample data. campaignLive: whether the sample 10% campaign actually runs.
export async function addSampleData({ campaignLive = false, customerPassword } = {}) {
  await ensureDefaultCategories()
  await removeSampleData({ keepCategoryState: true })

  // Jewellery has to be live for its sample products to show. Its old status is put back on removal.
  const jewelleryCat = await Category.findOne({ slug: 'jewellery' })
  const settings = await SiteSettings.findOne({ key: 'site' })
  if (jewelleryCat && !settings?.sampleState?.jewelleryStatus) {
    await SiteSettings.updateOne({ key: 'site' }, { $set: { 'sampleState.jewelleryStatus': jewelleryCat.status } }, { upsert: true })
  }
  if (jewelleryCat) await Category.updateOne({ _id: jewelleryCat._id }, { $set: { status: 'live' } })

  const products = await Product.insertMany(sampleProducts.map((p) => ({ ...p, active: true, sample: true })))
  const bySlug = new Map(products.map((p) => [p.slug, p]))
  const line = (slug, qty = 1, percentOff = 0) => {
    const p = bySlug.get(slug)
    const price = percentOff ? Math.round((p.price * (100 - percentOff)) / 100) : p.price
    return { product: p._id, slug: p.slug, name: p.name, price, ...(percentOff ? { listPrice: p.price } : {}), qty }
  }

  const password = customerPassword || randomBytes(6).toString('base64url')
  const customer = await Customer.create({
    phone: SAMPLE_CUSTOMER_PHONE,
    name: 'Sample Customer',
    email: 'sample.customer@example.com',
    passwordHash: await hashPassword(password),
    addresses: [
      { label: 'Home', name: 'Sample Customer', phone: SAMPLE_CUSTOMER_PHONE, city: 'Dhaka', address: 'House 1 (sample), Road 1, Dhanmondi' },
      { label: 'Office', name: 'Sample Customer', phone: SAMPLE_CUSTOMER_PHONE, city: 'Dhaka', address: 'Level 5 (sample), Gulshan Avenue' },
    ],
    wishlist: ['sample-golden-jhalor-jamdani', 'sample-shapla-carved-pendant'],
    sample: true,
  })
  customer.defaultAddress = customer.addresses[0]._id
  await customer.save()

  const mine = { name: 'Sample Customer', phone: SAMPLE_CUSTOMER_PHONE, email: 'sample.customer@example.com', city: 'Dhaka', address: 'House 1 (sample), Road 1, Dhanmondi' }
  const guest = (n, name, city) => ({ name: `${name} (sample)`, phone: `0110000010${n}`, city, address: `House ${n} (sample), ${city}` })

  const orders = [
    sampleOrder({ customer: mine, customerId: customer._id, items: [line('sample-shada-paar-jamdani'), line('sample-mango-wood-jhumka', 2)], status: 'delivered', days: 18 }),
    sampleOrder({ customer: mine, customerId: customer._id, items: [line('sample-golden-jhalor-jamdani', 1, 10)], status: 'shipped', days: 3 }),
    sampleOrder({ customer: mine, customerId: customer._id, items: [line('sample-terracotta-bala-set')], status: 'pending', days: 0.2, note: 'Please call before delivery.' }),
    sampleOrder({ customer: guest(1, 'Farzana Rahman', 'Chattogram'), items: [line('sample-shapla-carved-pendant')], status: 'pending', days: 0.5, inside: false }),
    sampleOrder({ customer: guest(2, 'Nabila Hossain', 'Dhaka'), items: [line('sample-shada-paar-jamdani'), line('sample-kodom-wood-earrings')], status: 'confirmed', days: 1 }),
    sampleOrder({ customer: guest(3, 'Tasnim Akter', 'Sylhet'), items: [line('sample-golden-jhalor-jamdani')], status: 'cancelled', days: 7, inside: false, note: 'Changed my mind about the colour.' }),
    sampleOrder({ customer: guest(4, 'Rumana Islam', 'Rajshahi'), items: [line('sample-mango-wood-jhumka', 3)], status: 'delivered', days: 25, inside: false }),
  ]
  await Order.collection.insertMany(orders) // raw insert keeps the back-dated createdAt

  const now = Date.now()
  await Campaign.create({
    name: 'Sample: Eid 10% off',
    title: 'Eid Mubarak: 10% off',
    titleBangla: 'ঈদ মোবারক',
    message: 'Sample campaign. 10% off every piece, wrapped and delivered before Eid.',
    image: `${IMG}/jamdani-red-on-loom.jpg`,
    ctaLabel: 'Shop the Eid edit',
    ctaLink: '/collections/new',
    percentOff: 10,
    categories: [],
    startsAt: new Date(now - DAY),
    endsAt: new Date(now + 7 * DAY),
    popup: true,
    active: campaignLive,
    sample: true,
  })

  return { products: products.length, orders: orders.length, customerPhone: SAMPLE_CUSTOMER_PHONE, customerPassword: password, campaignLive }
}

// Removes every sample document and puts the jewellery category back to how it was.
export async function removeSampleData({ keepCategoryState = false } = {}) {
  const [products, orders, customers, campaigns] = await Promise.all(
    [Product, Order, Customer, Campaign].map((m) => m.deleteMany({ sample: true })),
  )
  if (!keepCategoryState) {
    const settings = await SiteSettings.findOne({ key: 'site' })
    const previous = settings?.sampleState?.jewelleryStatus
    if (previous) await Category.updateOne({ slug: 'jewellery' }, { $set: { status: previous } })
    await SiteSettings.updateOne({ key: 'site' }, { $unset: { sampleState: 1 } })
  }
  return {
    products: products.deletedCount,
    orders: orders.deletedCount,
    customers: customers.deletedCount,
    campaigns: campaigns.deletedCount,
  }
}
