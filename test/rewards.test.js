import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { Admin } from '../src/models/Admin.js'
import { Campaign } from '../src/models/Campaign.js'
import { Category } from '../src/models/Category.js'
import { Customer } from '../src/models/Customer.js'
import { GiftCard } from '../src/models/GiftCard.js'
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { SiteSettings } from '../src/models/SiteSettings.js'
import { StockAlert } from '../src/models/StockAlert.js'
import { upsertAdmin } from '../src/seed/admins.js'
import { ensureSiteDefaults } from '../src/seed/content.js'
import { addSampleData, removeSampleData } from '../src/seed/sample.js'
import { seedProducts } from '../src/seed/seed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'

let mongo
let adminToken
const app = createApp()
const bearer = (t) => ({ Authorization: `Bearer ${t}` })
const admin = () => bearer(adminToken)
const DAY = 24 * 60 * 60 * 1000

// ash-shapla-butidar-jamdani: ৳11,200, 2 in stock. Inside Dhaka delivery is free.
const order = (overrides = {}) => ({
  customer: { name: 'Nusrat Jahan', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' },
  delivery: 'inside-dhaka',
  items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 1 }],
  ...overrides,
})

async function signUp() {
  return (await request(app).post('/api/account/register').send({ name: 'Nusrat Jahan', phone: '01712345678', password: 'shapla-2026' }).expect(201)).body
}

// A delivered order worth `amount` on the account, as if bought earlier.
async function pastSpend(customerId, amount) {
  const product = await Product.findOne({ slug: 'rokto-kolka-jamdani' })
  await Order.create({
    orderNumber: `AN-P${String(amount).slice(0, 5).padStart(5, '0')}`,
    items: [{ product: product._id, slug: product.slug, name: product.name, price: amount, qty: 1 }],
    subtotal: amount,
    delivery: { id: 'inside-dhaka', fee: 0 },
    total: amount,
    customer: { name: 'Nusrat Jahan', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5' },
    status: 'delivered',
    customerId,
  })
}

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-rewards-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Promise.all([Order, Admin, Product, Category, Customer, Campaign, SiteSettings, GiftCard, StockAlert].map((m) => m.deleteMany({})))
  await ensureSiteDefaults()
  await seedProducts()
  await upsertAdmin({ email: 'owner@aanchol.test', name: 'Owner', password: 'test-password-123' })
  adminToken = (await request(app).post('/api/admin/login').send({ email: 'owner@aanchol.test', password: 'test-password-123' })).body.token
})

describe('membership', () => {
  it('starts with the four default levels and gift wrap in the site data', async () => {
    const { body } = await request(app).get('/api/site').expect(200)
    assert.deepEqual(body.memberTiers.map((t) => [t.min, t.percent]), [[5000, 3], [10000, 5], [20000, 8], [30000, 12]])
    assert.deepEqual(body.giftWrap, { enabled: true, fee: 100 })
  })

  it('counts only delivered orders and gives a card number at the first level', async () => {
    const { token, customer } = await signUp()
    let { membership } = (await request(app).get('/api/account/membership').set(bearer(token)).expect(200)).body
    assert.equal(membership.tier, null)
    assert.equal(membership.next.name, 'Silver')
    assert.equal(membership.next.remaining, 5000)
    assert.equal(membership.memberNo, null)

    const id = (await Customer.findOne({ phone: customer.phone }))._id
    await pastSpend(id, 12000)
    // A pending order doesn't count.
    await request(app).post('/api/orders').set(bearer(token)).send(order()).expect(201)
    membership = (await request(app).get('/api/account/membership').set(bearer(token)).expect(200)).body.membership
    assert.equal(membership.spent, 12000)
    assert.equal(membership.tier.name, 'Gold')
    assert.equal(membership.next.remaining, 8000)
    assert.match(membership.memberNo, /^\d{8}$/)
    // The number stays the same.
    const again = (await request(app).get('/api/account/membership').set(bearer(token))).body.membership
    assert.equal(again.memberNo, membership.memberNo)
  })

  it('takes the member discount off the sale price, and guests get none', async () => {
    const { token, customer } = await signUp()
    await pastSpend((await Customer.findOne({ phone: customer.phone }))._id, 31000)
    const now = Date.now()
    await Campaign.create({ name: 'Eid', title: 'Eid 10% off', percentOff: 10, categories: [], startsAt: new Date(now - DAY), endsAt: new Date(now + DAY), active: true })

    // 11,200 → sale 10,080 → Diamond 12% = 1,210 off → 8,870
    const { body } = await request(app).post('/api/orders').set(bearer(token)).send(order({ expectedTotal: 8870 })).expect(201)
    assert.equal(body.order.subtotal, 10080)
    assert.deepEqual(body.order.member, { tier: 'Diamond', percent: 12, discount: 1210 })
    assert.equal(body.order.total, 8870)

    const guest = (await request(app).post('/api/orders').send(order()).expect(201)).body.order
    assert.equal(guest.member, undefined)
    assert.equal(guest.total, 10080)
  })

  it('refuses an order whose total changed since checkout opened', async () => {
    const { token, customer } = await signUp()
    await pastSpend((await Customer.findOne({ phone: customer.phone }))._id, 6000)
    // Checkout showed no member discount, but the customer is now Silver (3%).
    const res = await request(app).post('/api/orders').set(bearer(token)).send(order({ expectedTotal: 11200 })).expect(409)
    assert.equal(res.body.code, 'PRICE_CHANGED')
    assert.equal(res.body.memberPercent, 3)
    assert.equal((await Product.findOne({ slug: 'ash-shapla-butidar-jamdani' })).stock, 2)
  })

  it('lets the admin change the levels, with checks', async () => {
    const bad = await request(app)
      .patch('/api/admin/settings')
      .set(admin())
      .send({ memberTiers: [{ name: 'Silver', min: 5000, percent: 5 }, { name: 'Gold', min: 10000, percent: 4 }] })
      .expect(400)
    assert.match(bad.body.fields.memberTiers, /bigger discount/)
    await request(app).patch('/api/admin/settings').set(admin()).send({ memberTiers: [{ name: 'Rupa', min: 3000, percent: 2 }] }).expect(200)
    const { body } = await request(app).get('/api/site')
    assert.deepEqual(body.memberTiers, [{ name: 'Rupa', min: 3000, percent: 2 }])
  })
})

describe('gift wrap', () => {
  it('adds the fee and keeps the message; can be switched off', async () => {
    const { body } = await request(app).post('/api/orders').send(order({ giftWrap: { message: 'Happy Eid, Ammu!' }, expectedTotal: 11300 })).expect(201)
    assert.deepEqual(body.order.giftWrap, { message: 'Happy Eid, Ammu!', fee: 100 })
    assert.equal(body.order.total, 11300)

    const long = await request(app).post('/api/orders').send(order({ giftWrap: { message: 'x'.repeat(201) } })).expect(400)
    assert.ok(long.body.fields.giftWrap)

    await request(app).patch('/api/admin/settings').set(admin()).send({ giftWrap: { enabled: false, fee: 100 } }).expect(200)
    await request(app).post('/api/orders').send(order({ giftWrap: { message: '' } })).expect(409)
  })
})

describe('gift cards', () => {
  const requestCard = (overrides = {}) =>
    request(app)
      .post('/api/gift-cards')
      .send({ amount: 5000, buyerName: 'Farzana', buyerPhone: '01812345678', recipientName: 'Mitu', message: 'Happy birthday!', paymentMethod: 'bkash', ...overrides })

  it('is ordered online, waits for payment, then the admin activates it', async () => {
    const bad = await requestCard({ amount: 250, paymentMethod: 'card' }).expect(400)
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['amount', 'paymentMethod'])

    const { giftCard } = (await requestCard().expect(201)).body
    assert.match(giftCard.reference, /^GC-[A-Z0-9]{6}$/)
    assert.equal(giftCard.state, 'pending')
    assert.equal(giftCard.code, undefined)

    const list = (await request(app).get('/api/admin/gift-cards?status=pending').set(admin()).expect(200)).body
    assert.equal(list.pending, 1)
    const id = list.giftCards[0].id
    const active = (await request(app).post(`/api/admin/gift-cards/${id}/activate`).set(admin()).expect(200)).body.giftCard
    assert.match(active.code, /^GIFT-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    assert.equal(active.payment.paid, true)
    assert.ok(new Date(active.expiresAt) > new Date(Date.now() + 360 * DAY))
    await request(app).post(`/api/admin/gift-cards/${id}/activate`).set(admin()).expect(409)

    // Spaces and lower case are fine when typing the code.
    const typed = active.code.toLowerCase().replace(/-/g, ' ')
    const checked = (await request(app).post('/api/gift-cards/check').send({ code: typed }).expect(200)).body.giftCard
    assert.equal(checked.balance, 5000)
    await request(app).post('/api/gift-cards/check').send({ code: 'GIFT-AAAA-AAAA' }).expect(404)
  })

  it('pays part of an order, is refunded when the order is cancelled, and runs out', async () => {
    const card = (await request(app).post('/api/admin/gift-cards').set(admin()).send({ amount: 5000, recipientName: 'Mitu' }).expect(201)).body.giftCard
    assert.equal(card.state, 'active')

    const first = (await request(app).post('/api/orders').send(order({ giftCard: card.code })).expect(201)).body.order
    assert.equal(first.total, 6200) // 11,200 − 5,000 from the card
    assert.equal(first.giftCard.amount, 5000)
    assert.match(first.giftCard.code, /^GIFT-••••-/)
    assert.equal((await GiftCard.findById(card.id)).balance, 0)

    // Fully used now.
    const used = await request(app).post('/api/orders').send(order({ giftCard: card.code })).expect(409)
    assert.match(used.body.fields.giftCard, /fully used/)

    await request(app).patch(`/api/admin/orders/${first.id}`).set(admin()).send({ status: 'cancelled' }).expect(200)
    await request(app).patch(`/api/admin/orders/${first.id}`).set(admin()).send({ status: 'cancelled' }).expect(200)
    const refunded = await GiftCard.findById(card.id)
    assert.equal(refunded.balance, 5000)
    assert.equal(refunded.uses[0].refunded, true)
    // A card with history can't be cancelled.
    await request(app).post(`/api/admin/gift-cards/${card.id}/cancel`).set(admin()).expect(409)
  })

  it('covers a small order completely and keeps the rest', async () => {
    const card = (await request(app).post('/api/admin/gift-cards').set(admin()).send({ amount: 20000, recipientName: 'Mitu' })).body.giftCard
    const placed = (await request(app).post('/api/orders').send(order({ giftCard: card.code, delivery: 'outside-dhaka' })).expect(201)).body.order
    assert.equal(placed.giftCard.amount, 11350)
    assert.equal(placed.total, 0)
    assert.equal((await GiftCard.findById(card.id)).balance, 8650)
  })

  it('shows cards to the customer who ordered them, with the code once paid', async () => {
    const { token } = await signUp()
    await request(app).post('/api/gift-cards').set(bearer(token)).send({ amount: 2000, recipientName: 'Mitu', paymentMethod: 'cash' }).expect(201)
    let cards = (await request(app).get('/api/account/gift-cards').set(bearer(token)).expect(200)).body.giftCards
    assert.equal(cards.length, 1)
    assert.equal(cards[0].code, undefined)
    const id = (await GiftCard.findOne())._id
    await request(app).post(`/api/admin/gift-cards/${id}/activate`).set(admin()).expect(200)
    cards = (await request(app).get('/api/account/gift-cards').set(bearer(token))).body.giftCards
    assert.match(cards[0].code, /^GIFT-/)
  })
})

describe('back in stock', () => {
  it('takes requests only for sold-out pieces, once per number, and the admin closes them', async () => {
    const res = await request(app).post('/api/products/rokto-kolka-jamdani/notify').send({ phone: '01712345678' }).expect(409)
    assert.match(res.body.error, /in stock/)

    await Product.updateOne({ slug: 'rokto-kolka-jamdani' }, { $set: { stock: 0 } })
    await request(app).post('/api/products/rokto-kolka-jamdani/notify').send({ phone: '017-1234-5678' }).expect(201)
    await request(app).post('/api/products/rokto-kolka-jamdani/notify').send({ phone: '01712345678' }).expect(201)
    await request(app).post('/api/products/rokto-kolka-jamdani/notify').send({ phone: '12345' }).expect(400)
    assert.equal(await StockAlert.countDocuments(), 1)

    let badges = (await request(app).get('/api/admin/badges').set(admin()).expect(200)).body
    assert.equal(badges.restock, 0) // nobody to tell until it's back
    await Product.updateOne({ slug: 'rokto-kolka-jamdani' }, { $set: { stock: 2 } })
    badges = (await request(app).get('/api/admin/badges').set(admin())).body
    assert.equal(badges.restock, 1)

    const { groups } = (await request(app).get('/api/admin/stock-alerts').set(admin()).expect(200)).body
    assert.equal(groups[0].product.name, 'Rokto Kolka Jamdani')
    assert.equal(groups[0].waiting[0].phone, '01712345678')
    await request(app).post(`/api/admin/stock-alerts/${groups[0].waiting[0].id}/done`).set(admin()).expect(204)
    await request(app).post(`/api/admin/stock-alerts/${groups[0].waiting[0].id}/done`).set(admin()).expect(404)
    assert.equal((await request(app).get('/api/admin/stock-alerts').set(admin())).body.groups.length, 0)
  })
})

describe('complete the look', () => {
  it('saves paired pieces on a product', async () => {
    await request(app).patch('/api/admin/products/rokto-kolka-jamdani').set(admin()).send({ pairsWith: ['Not A Slug'] }).expect(400)
    await request(app)
      .patch('/api/admin/products/rokto-kolka-jamdani')
      .set(admin())
      .send({ pairsWith: ['kacha-holud-jamdani', 'kacha-holud-jamdani'] })
      .expect(200)
    const { product } = (await request(app).get('/api/products/rokto-kolka-jamdani')).body
    assert.deepEqual(product.pairsWith, ['kacha-holud-jamdani'])
  })
})

describe('sample data', () => {
  it('adds and removes sample gift cards and restock requests', async () => {
    await addSampleData({ customerPassword: 'sample-pass-123' })
    assert.equal(await GiftCard.countDocuments({ sample: true }), 2)
    assert.equal(await StockAlert.countDocuments({ sample: true }), 3)
    await removeSampleData()
    assert.equal(await GiftCard.countDocuments(), 0)
    assert.equal(await StockAlert.countDocuments(), 0)
  })
})
