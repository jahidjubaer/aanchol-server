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
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { SiteSettings } from '../src/models/SiteSettings.js'
import { upsertAdmin } from '../src/seed/admins.js'
import { ensureSiteDefaults } from '../src/seed/content.js'
import { addSampleData, removeSampleData, SAMPLE_CUSTOMER_PHONE } from '../src/seed/sample.js'
import { seedProducts } from '../src/seed/seed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'

let mongo
let adminToken
const app = createApp()
const bearer = (t) => ({ Authorization: `Bearer ${t}` })
const NUSRAT = { name: 'Nusrat Jahan', phone: '+880 1712-345678', password: 'shapla-2026' }

const order = (overrides = {}) => ({
  customer: { name: 'Nusrat Jahan', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' },
  delivery: 'inside-dhaka',
  items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 1 }],
  ...overrides,
})

async function signUp(body = NUSRAT) {
  return (await request(app).post('/api/account/register').send(body).expect(201)).body
}

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-account-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Promise.all([Order, Admin, Product, Category, Customer, Campaign, SiteSettings].map((m) => m.deleteMany({})))
  await ensureSiteDefaults()
  await seedProducts()
  await upsertAdmin({ email: 'owner@aanchol.test', name: 'Owner', password: 'test-password-123' })
  adminToken = (await request(app).post('/api/admin/login').send({ email: 'owner@aanchol.test', password: 'test-password-123' })).body.token
})

describe('sign up and sign in', () => {
  it('creates an account with a normalised phone and never returns the password', async () => {
    const { token, customer } = await signUp()
    assert.ok(token)
    assert.equal(customer.phone, '01712345678')
    assert.equal(customer.passwordHash, undefined)
    assert.match((await Customer.findOne()).passwordHash, /^[0-9a-f]{32}:/)
  })

  it('explains bad details and refuses a number that already has an account', async () => {
    const bad = await request(app).post('/api/account/register').send({ name: 'N', phone: '12345', password: 'short' }).expect(400)
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['name', 'password', 'phone'])
    await signUp()
    const dup = await request(app).post('/api/account/register').send({ ...NUSRAT, phone: '01712345678' }).expect(409)
    assert.match(dup.body.fields.phone, /already has an account/)
    // The 011 range is for samples only.
    await request(app).post('/api/account/register').send({ ...NUSRAT, phone: '01100000009' }).expect(400)
  })

  it('signs in with the right password only, same answer for unknown numbers', async () => {
    await signUp()
    await request(app).post('/api/account/login').send({ phone: '01712345678', password: NUSRAT.password }).expect(200)
    const wrong = await request(app).post('/api/account/login').send({ phone: '01712345678', password: 'nope-nope' }).expect(401)
    const unknown = await request(app).post('/api/account/login').send({ phone: '01812345678', password: 'nope-nope' }).expect(401)
    assert.equal(wrong.body.error, unknown.body.error)
  })

  it('keeps customer and admin logins apart', async () => {
    const { token } = await signUp()
    await request(app).get('/api/admin/orders').set(bearer(token)).expect(401)
    await request(app).get('/api/account/me').set(bearer(adminToken)).expect(401)
    await request(app).get('/api/account/me').expect(401)
  })
})

describe('profile, password and addresses', () => {
  it('changes the password and signs out other devices', async () => {
    const { token } = await signUp()
    await request(app).post('/api/account/password').set(bearer(token)).send({ current: 'wrong-one', password: 'new-pass-2026' }).expect(400)
    const res = await request(app).post('/api/account/password').set(bearer(token)).send({ current: NUSRAT.password, password: 'new-pass-2026' }).expect(200)
    await request(app).get('/api/account/me').set(bearer(token)).expect(401)
    await request(app).get('/api/account/me').set(bearer(res.body.token)).expect(200)
  })

  it('edits the profile and manages addresses with a default', async () => {
    const { token } = await signUp()
    const me = await request(app).patch('/api/account/me').set(bearer(token)).send({ name: 'Nusrat J.', email: 'Nusrat@Example.com' }).expect(200)
    assert.equal(me.body.customer.email, 'nusrat@example.com')

    const home = { label: 'Home', name: 'Nusrat', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' }
    let res = await request(app).post('/api/account/addresses').set(bearer(token)).send(home).expect(201)
    const first = res.body.customer.addresses[0].id
    assert.equal(res.body.customer.defaultAddress, first)
    res = await request(app).post('/api/account/addresses').set(bearer(token)).send({ ...home, label: 'Office', makeDefault: true }).expect(201)
    const second = res.body.customer.addresses[1].id
    assert.equal(res.body.customer.defaultAddress, second)
    res = await request(app).delete(`/api/account/addresses/${second}`).set(bearer(token)).expect(200)
    assert.equal(res.body.customer.defaultAddress, first)
    await request(app).post('/api/account/addresses').set(bearer(token)).send({ ...home, phone: '123' }).expect(400)
  })

  it('merges the device wishlist into the account', async () => {
    const { token } = await signUp()
    await request(app).put('/api/account/wishlist').set(bearer(token)).send({ wishlist: ['rongdhonu-jamdani'] }).expect(200)
    const res = await request(app).post('/api/account/wishlist/merge').set(bearer(token)).send({ wishlist: ['kacha-holud-jamdani', 'rongdhonu-jamdani'] }).expect(200)
    assert.deepEqual(res.body.wishlist, ['kacha-holud-jamdani', 'rongdhonu-jamdani'])
    await request(app).put('/api/account/wishlist').set(bearer(token)).send({ wishlist: ['$bad'] }).expect(400)
  })
})

describe('orders', () => {
  it('links an order placed while signed in, and still takes guest orders', async () => {
    const { token } = await signUp()
    const mine = await request(app).post('/api/orders').set(bearer(token)).send(order()).expect(201)
    await request(app).post('/api/orders').send(order({ items: [{ slug: 'kacha-holud-jamdani', qty: 1 }] })).expect(201)
    // An expired or broken login never blocks an order.
    await request(app).post('/api/orders').set(bearer('broken')).send(order({ items: [{ slug: 'rongdhonu-jamdani', qty: 1 }] })).expect(201)

    const list = await request(app).get('/api/account/orders').set(bearer(token)).expect(200)
    assert.deepEqual(list.body.orders.map((o) => o.id), [mine.body.order.id])
    const one = await request(app).get(`/api/account/orders/${mine.body.order.id}`).set(bearer(token)).expect(200)
    assert.equal(one.body.order.timeline[0].status, 'pending')
    assert.equal(one.body.order.timeline[0].by, undefined)
    assert.equal(one.body.order.adminNote, undefined)
  })

  it('adds a guest order only with its number and the same phone', async () => {
    const guest = (await request(app).post('/api/orders').send(order()).expect(201)).body.order.id
    const other = (await request(app).post('/api/orders').send(order({ customer: { ...order().customer, phone: '01812345678' }, items: [{ slug: 'kacha-holud-jamdani', qty: 1 }] })).expect(201)).body.order.id
    const { token } = await signUp()

    await request(app).post('/api/account/orders/claim').set(bearer(token)).send({ orderNumber: other }).expect(400)
    const res = await request(app).post('/api/account/orders/claim').set(bearer(token)).send({ orderNumber: guest.toLowerCase() }).expect(200)
    assert.equal(res.body.order.id, guest)
    assert.equal((await request(app).get('/api/account/orders').set(bearer(token))).body.orders.length, 1)
  })

  it('keeps another account\'s order out of reach', async () => {
    const a = await signUp()
    const placed = (await request(app).post('/api/orders').set(bearer(a.token)).send(order()).expect(201)).body.order.id
    const b = await signUp({ name: 'Someone Else', phone: '01812345678', password: 'another-pass' })
    await request(app).get(`/api/account/orders/${placed}`).set(bearer(b.token)).expect(404)
  })
})

describe('admin and password reset', () => {
  it('lists and searches customers with order counts', async () => {
    const { token } = await signUp()
    await request(app).post('/api/orders').set(bearer(token)).send(order()).expect(201)
    await request(app).get('/api/admin/customers').expect(401)
    const res = await request(app).get('/api/admin/customers?q=0171').set(bearer(adminToken)).expect(200)
    assert.equal(res.body.customers.length, 1)
    assert.equal(res.body.customers[0].orderCount, 1)
    const detail = await request(app).get(`/api/admin/customers/${res.body.customers[0].id}`).set(bearer(adminToken)).expect(200)
    assert.equal(detail.body.orders.length, 1)
  })

  it('makes a one-time reset link that signs the customer out elsewhere', async () => {
    const { token } = await signUp()
    const id = (await Customer.findOne())._id
    const { body } = await request(app).post(`/api/admin/customers/${id}/reset-link`).set(bearer(adminToken)).expect(200)
    await request(app).post('/api/account/reset').send({ token: body.token, password: 'short' }).expect(400)
    const reset = await request(app).post('/api/account/reset').send({ token: body.token, password: 'fresh-pass-2026' }).expect(200)
    assert.ok(reset.body.token)
    await request(app).get('/api/account/me').set(bearer(token)).expect(401)
    await request(app).post('/api/account/reset').send({ token: body.token, password: 'again-pass-2026' }).expect(400)
    await request(app).post('/api/account/login').send({ phone: '01712345678', password: 'fresh-pass-2026' }).expect(200)
  })

  it('pauses an account', async () => {
    const { token } = await signUp()
    const id = (await Customer.findOne())._id
    await request(app).patch(`/api/admin/customers/${id}`).set(bearer(adminToken)).send({ active: false }).expect(200)
    await request(app).get('/api/account/me').set(bearer(token)).expect(401)
    await request(app).post('/api/account/login').send({ phone: '01712345678', password: NUSRAT.password }).expect(403)
  })
})

describe('sample data', () => {
  it('adds marked demo data and removes all of it again', async () => {
    const result = await addSampleData({ customerPassword: 'sample-pass-123' })
    assert.equal(result.campaignLive, false)
    assert.equal((await Category.findOne({ slug: 'jewellery' })).status, 'live')

    const products = (await request(app).get('/api/products?category=jewellery').expect(200)).body.products
    assert.ok(products.length >= 4)
    assert.equal(products[0].sample, undefined)
    assert.equal((await request(app).get('/api/site')).body.campaign, null)

    const login = await request(app).post('/api/account/login').send({ phone: SAMPLE_CUSTOMER_PHONE, password: 'sample-pass-123' }).expect(200)
    const mine = await request(app).get('/api/account/orders').set(bearer(login.body.token)).expect(200)
    assert.equal(mine.body.orders.length, 3)
    const admin = await request(app).get('/api/admin/orders').set(bearer(adminToken)).expect(200)
    assert.ok(admin.body.orders.every((o) => o.sample))

    // Running it again refreshes rather than duplicating.
    await addSampleData({ customerPassword: 'sample-pass-123' })
    assert.equal(await Customer.countDocuments({ sample: true }), 1)

    const removed = await removeSampleData()
    assert.equal(removed.customers, 1)
    assert.equal(await Order.countDocuments(), 0)
    assert.equal(await Product.countDocuments({ sample: true }), 0)
    assert.equal(await Product.countDocuments(), 6) // the real products stay
    assert.equal((await Category.findOne({ slug: 'jewellery' })).status, 'coming-soon')
  })
})
