import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { Admin } from '../src/models/Admin.js'
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { upsertAdmin } from '../src/seed/admins.js'
import { seedProducts } from '../src/seed/seed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'

const ADMIN = { email: 'owner@aanchol.test', name: 'Owner', password: 'test-password-123' }
let mongo
let token
const app = createApp()
const auth = () => ({ Authorization: `Bearer ${token}` })

async function placeOrder(name, phone, slug = 'ash-shapla-butidar-jamdani') {
  const res = await request(app)
    .post('/api/orders')
    .send({ customer: { name, phone, city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' }, delivery: 'inside-dhaka', items: [{ slug, qty: 1 }] })
    .expect(201)
  return res.body.order.id
}

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-admin-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Promise.all([Order.deleteMany({}), Admin.deleteMany({})])
  await seedProducts()
  await upsertAdmin(ADMIN)
  const res = await request(app).post('/api/admin/login').send({ email: ADMIN.email, password: ADMIN.password }).expect(200)
  token = res.body.token
})

describe('admin login', () => {
  it('returns a token and the admin, never the password hash', async () => {
    const res = await request(app).post('/api/admin/login').send({ email: ' OWNER@aanchol.test ', password: ADMIN.password }).expect(200)
    assert.ok(res.body.token)
    assert.deepEqual(res.body.admin, { email: ADMIN.email, name: 'Owner' })
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await request(app).post('/api/admin/login').send({ email: ADMIN.email, password: 'nope-nope-nope' }).expect(401)
    const unknown = await request(app).post('/api/admin/login').send({ email: 'x@y.z', password: 'nope-nope-nope' }).expect(401)
    assert.equal(wrong.body.error, unknown.body.error)
  })

  it('stores passwords hashed', async () => {
    const admin = await Admin.findOne({ email: ADMIN.email })
    assert.notEqual(admin.passwordHash, ADMIN.password)
    assert.match(admin.passwordHash, /^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it('blocks admin routes without a valid token', async () => {
    await request(app).get('/api/admin/orders').expect(401)
    await request(app).get('/api/admin/orders').set('Authorization', 'Bearer junk').expect(401)
    const forged = jwt.sign({ sub: 'not-an-id' }, process.env.JWT_SECRET)
    await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${forged}`).expect(401)
    const otherSecret = jwt.sign({ sub: String((await Admin.findOne())._id) }, 'some-other-secret-of-32-characters!!')
    await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${otherSecret}`).expect(401)
    await request(app).get('/api/admin/me').set(auth()).expect(200)
  })

  it('logs out a deactivated admin', async () => {
    await Admin.updateOne({ email: ADMIN.email }, { active: false })
    await request(app).get('/api/admin/me').set(auth()).expect(401)
  })
})

describe('admin orders', () => {
  it('lists orders newest first with counts per status', async () => {
    await placeOrder('Nusrat Jahan', '01712345678')
    await placeOrder('Farzana Akter', '01898765432', 'rongdhonu-jamdani')
    const res = await request(app).get('/api/admin/orders').set(auth()).expect(200)
    assert.equal(res.body.total, 2)
    assert.equal(res.body.orders[0].customer.name, 'Farzana Akter')
    assert.equal(res.body.counts.pending, 2)
    assert.deepEqual(res.body.orders[0].next, ['confirmed', 'cancelled'])
  })

  it('searches by order number, phone and name, and filters by status', async () => {
    const id = await placeOrder('Nusrat Jahan', '01712345678')
    await placeOrder('Anika Rahman', '01898765432', 'rongdhonu-jamdani')
    const search = async (q) => (await request(app).get('/api/admin/orders').query({ q }).set(auth())).body.orders.map((o) => o.customer.name)
    assert.deepEqual(await search(id.toLowerCase()), ['Nusrat Jahan'])
    assert.deepEqual(await search('+88 0189'), ['Anika Rahman'])
    assert.deepEqual(await search('anika'), ['Anika Rahman'])
    assert.deepEqual(await search('(.*'), [])
    const confirmed = await request(app).get('/api/admin/orders?status=confirmed').set(auth())
    assert.equal(confirmed.body.total, 0)
  })

  it('moves an order through its statuses and records who did it', async () => {
    const id = await placeOrder('Nusrat Jahan', '01712345678')
    for (const status of ['confirmed', 'shipped', 'delivered']) {
      await request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ status }).expect(200)
    }
    const res = await request(app).get(`/api/admin/orders/${id}`).set(auth()).expect(200)
    assert.equal(res.body.order.status, 'delivered')
    assert.equal(res.body.order.payment.paid, true)
    assert.deepEqual(res.body.order.next, [])
    assert.deepEqual(res.body.order.statusHistory.map((h) => `${h.status}:${h.by}`), [
      'pending:customer',
      `confirmed:${ADMIN.email}`,
      `shipped:${ADMIN.email}`,
      `delivered:${ADMIN.email}`,
    ])
  })

  it('refuses skipped or backward steps', async () => {
    const id = await placeOrder('Nusrat Jahan', '01712345678')
    await request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ status: 'delivered' }).expect(409)
    await request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ status: 'made-up' }).expect(409)
  })

  it('puts the stock back when an order is cancelled, only once', async () => {
    const id = await placeOrder('Nusrat Jahan', '01712345678', 'rongdhonu-jamdani')
    assert.equal((await Product.findOne({ slug: 'rongdhonu-jamdani' })).stock, 0)
    const results = await Promise.all(
      [1, 2, 3].map(() => request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ status: 'cancelled' })),
    )
    assert.equal(results.filter((r) => r.status === 200).length, 1)
    assert.equal((await Product.findOne({ slug: 'rongdhonu-jamdani' })).stock, 1)
    await request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ status: 'confirmed' }).expect(409)
  })

  it('saves a private note that customers never see', async () => {
    const id = await placeOrder('Nusrat Jahan', '01712345678')
    const res = await request(app).patch(`/api/admin/orders/${id}`).set(auth()).send({ adminNote: '  Called, will collect Friday ' }).expect(200)
    assert.equal(res.body.order.adminNote, 'Called, will collect Friday')
    assert.equal((await Order.findOne()).toJSON().adminNote, undefined)
  })

  it('404s an unknown order', async () => {
    await request(app).get('/api/admin/orders/AN-ZZZZZZ').set(auth()).expect(404)
  })
})
