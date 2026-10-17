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
  await mongoose.connect(mongo.getUri('aanchol-payments-test'))
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

const BKASH = { enabled: true, number: '01812345678' }
const turnOnWallets = () =>
  request(app).patch('/api/admin/settings').set(admin()).send({ payments: { bkash: BKASH, nagad: { enabled: false, number: '' }, minAdvance: 120 } }).expect(200)
const pay = (overrides = {}) => ({ method: 'bkash', plan: 'advance', trxId: '8N7A6B5C4D', sender: '01712345678', ...overrides })

describe('payment settings', () => {
  it('starts off, needs a real number to turn on, and is shown to the shop', async () => {
    let { body } = await request(app).get('/api/site')
    assert.equal(body.payments.bkash.enabled, false)
    assert.equal(body.payments.minAdvance, 120)

    const bad = await request(app)
      .patch('/api/admin/settings')
      .set(admin())
      .send({ payments: { bkash: { enabled: true, number: '' }, nagad: { enabled: false, number: '' }, minAdvance: 120 } })
      .expect(400)
    assert.match(bad.body.fields.payments, /Add the bKash number/)
    await turnOnWallets()
    body = (await request(app).get('/api/site')).body
    assert.deepEqual(body.payments.bkash, BKASH)
  })

  it('keeps plain cash on delivery while no wallet is on', async () => {
    const { body } = await request(app).post('/api/orders').send(order()).expect(201)
    assert.deepEqual(body.order.payment, { method: 'cod', paid: false })
  })
})

describe('advance by bKash or Nagad', () => {
  it('needs the advance once a wallet is on', async () => {
    await turnOnWallets()
    const none = await request(app).post('/api/orders').send(order()).expect(400)
    assert.ok(none.body.fields.paymentMethod)
    const bad = await request(app).post('/api/orders').send(order({ payment: { method: 'rocket', plan: 'x', trxId: '12', sender: '123' } })).expect(400)
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['paymentMethod', 'paymentPlan', 'sender', 'trxId'])
    const nagadOff = await request(app).post('/api/orders').send(order({ payment: pay({ method: 'nagad' }) })).expect(400)
    assert.match(nagadOff.body.fields.paymentMethod, /not available/)
  })

  it('takes ৳120 when delivery is free, the delivery charge outside Dhaka, or everything', async () => {
    await turnOnWallets()
    const inside = (await request(app).post('/api/orders').send(order({ payment: pay({ amount: 120 }) })).expect(201)).body.order
    assert.equal(inside.payment.advance, 120)
    assert.equal(inside.payment.verified, false)
    assert.equal(inside.total, 11200) // 120 now, 11,080 on delivery

    const outside = (await request(app).post('/api/orders').send(order({ delivery: 'outside-dhaka', items: [{ slug: 'kacha-holud-jamdani', qty: 1 }], payment: pay({ trxId: 'AB12CD34EF' }) })).expect(201)).body.order
    assert.equal(outside.payment.advance, 150)

    const full = (await request(app).post('/api/orders').send(order({ items: [{ slug: 'rongdhonu-jamdani', qty: 1 }], payment: pay({ plan: 'full', trxId: 'ZZ99YY88XX' }) })).expect(201)).body.order
    assert.equal(full.payment.advance, 24500)

    // The amount checkout showed must match.
    const changed = await request(app).post('/api/orders').send(order({ payment: pay({ trxId: 'QQ11WW22EE', amount: 150 }) })).expect(409)
    assert.equal(changed.body.code, 'PRICE_CHANGED')
    assert.equal(changed.body.advance, 120)
  })

  it('refuses a transaction ID used before, in any spelling', async () => {
    await turnOnWallets()
    await request(app).post('/api/orders').send(order({ payment: pay() })).expect(201)
    const again = await request(app).post('/api/orders').send(order({ payment: pay({ trxId: '8n7a 6b5c 4d' }) })).expect(409)
    assert.match(again.body.fields.trxId, /already been used/)
    assert.equal((await Product.findOne({ slug: 'ash-shapla-butidar-jamdani' })).stock, 1) // only the first took stock
  })

  it('needs nothing when a gift card pays for everything', async () => {
    await turnOnWallets()
    const card = (await request(app).post('/api/admin/gift-cards').set(admin()).send({ amount: 20000, recipientName: 'Mitu' })).body.giftCard
    const { body } = await request(app).post('/api/orders').send(order({ giftCard: card.code })).expect(201)
    assert.deepEqual(body.order.payment, { method: 'cod', paid: true })
  })

  it('can only be confirmed after the admin checks the payment', async () => {
    await turnOnWallets()
    const placed = (await request(app).post('/api/orders').send(order({ payment: pay({ plan: 'full' }) })).expect(201)).body.order
    let list = (await request(app).get('/api/admin/orders?status=payment').set(admin()).expect(200)).body
    assert.equal(list.counts.payment, 1)
    assert.equal(list.orders[0].paymentToCheck, true)
    assert.equal((await request(app).get('/api/admin/badges').set(admin())).body.payments, 1)

    const early = await request(app).patch(`/api/admin/orders/${placed.id}`).set(admin()).send({ status: 'confirmed' }).expect(409)
    assert.match(early.body.error, /8N7A6B5C4D/)

    const { order: checked } = (await request(app).patch(`/api/admin/orders/${placed.id}`).set(admin()).send({ paymentVerified: true }).expect(200)).body
    assert.equal(checked.payment.verified, true)
    assert.equal(checked.payment.paid, true) // paid in full
    assert.equal(checked.paymentVerifiedBy, 'owner@aanchol.test')
    await request(app).patch(`/api/admin/orders/${placed.id}`).set(admin()).send({ paymentVerified: true }).expect(409)
    await request(app).patch(`/api/admin/orders/${placed.id}`).set(admin()).send({ status: 'confirmed' }).expect(200)
    list = (await request(app).get('/api/admin/orders').set(admin())).body
    assert.equal(list.counts.payment, 0)
  })
})
