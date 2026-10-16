import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { seedProducts } from '../src/seed/seed.js'

process.env.NODE_ENV = 'test' // turns off the order rate limit, except in its own test

let mongo
const app = createApp()

const validOrder = (overrides = {}) => ({
  customer: { name: 'Nusrat Jahan', phone: '+880 1712-345678', email: '', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' },
  delivery: 'outside-dhaka',
  items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 1 }],
  ...overrides,
})

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Order.deleteMany({})
  await seedProducts()
})

describe('products', () => {
  it('lists active products, newest first, without internal fields', async () => {
    const res = await request(app).get('/api/products?category=jamdani').expect(200)
    assert.equal(res.body.products.length, 6)
    assert.equal(res.body.products[0].slug, 'ash-shapla-butidar-jamdani')
    assert.equal(res.body.products[0].addedOn, '2026-10-14')
    assert.equal(res.body.products[0]._id, undefined)
    assert.equal(res.body.products[0].active, undefined)
  })

  it('hides inactive products', async () => {
    await Product.updateOne({ slug: 'kacha-holud-jamdani' }, { active: false })
    const res = await request(app).get('/api/products').expect(200)
    assert.equal(res.body.products.length, 5)
    await request(app).get('/api/products/kacha-holud-jamdani').expect(404)
  })

  it('returns one product by slug', async () => {
    const res = await request(app).get('/api/products/rongdhonu-jamdani').expect(200)
    assert.equal(res.body.product.price, 24500)
  })
})

describe('orders', () => {
  it('creates an order with server-side prices and takes the stock', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send(validOrder({ items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 2, price: 1 }] }))
      .expect(201)
    const { order } = res.body
    assert.match(order.id, /^AN-[2-9A-HJ-NP-Z]{6}$/)
    assert.equal(order.subtotal, 22400) // 11200 × 2, the browser's "price: 1" is ignored
    assert.equal(order.delivery.fee, 150)
    assert.equal(order.total, 22550)
    assert.equal(order.customer.phone, '01712345678')
    assert.equal(order.status, 'pending')
    assert.equal((await Product.findOne({ slug: 'ash-shapla-butidar-jamdani' })).stock, 0)
  })

  it('rejects invalid details with field errors', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send(validOrder({ customer: { name: 'N', phone: '12345', city: '', address: 'x' }, delivery: 'mars' }))
      .expect(400)
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['address', 'city', 'delivery', 'name', 'phone'])
  })

  it('rejects more than the stock and leaves stock unchanged', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send(validOrder({ items: [{ slug: 'rongdhonu-jamdani', qty: 2 }] }))
      .expect(409)
    assert.deepEqual(res.body.items, [{ slug: 'rongdhonu-jamdani', available: 1 }])
    assert.equal((await Product.findOne({ slug: 'rongdhonu-jamdani' })).stock, 1)
  })

  it('counts repeated lines for the same sari together', async () => {
    await request(app)
      .post('/api/orders')
      .send(validOrder({ items: [{ slug: 'rongdhonu-jamdani', qty: 1 }, { slug: 'rongdhonu-jamdani', qty: 1 }] }))
      .expect(409)
  })

  it('sells the last sari only once when two orders arrive together', async () => {
    const items = [{ slug: 'rongdhonu-jamdani', qty: 1 }]
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/orders').send(validOrder({ items }))),
    )
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409, 409])
    assert.equal(await Order.countDocuments(), 1)
    assert.equal((await Product.findOne({ slug: 'rongdhonu-jamdani' })).stock, 0)
  })

  it('puts back reserved stock when a later item fails', async () => {
    // Empty Kacha Holud's stock just before reservation, after the availability check passes.
    const realUpdate = Product.updateOne.bind(Product)
    Product.updateOne = async (filter, update) => {
      if (update.$inc?.stock < 0 && String(filter._id) === String(kacha._id)) await realUpdate({ _id: kacha._id }, { stock: 0 })
      return realUpdate(filter, update)
    }
    const kacha = await Product.findOne({ slug: 'kacha-holud-jamdani' })
    try {
      await request(app)
        .post('/api/orders')
        .send(validOrder({ items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 2 }, { slug: 'kacha-holud-jamdani', qty: 1 }] }))
        .expect(409)
    } finally {
      Product.updateOne = realUpdate
    }
    assert.equal((await Product.findOne({ slug: 'ash-shapla-butidar-jamdani' })).stock, 2)
  })

  it('rejects unknown products, bad JSON and operator injection', async () => {
    await request(app).post('/api/orders').send(validOrder({ items: [{ slug: 'nope', qty: 1 }] })).expect(409)
    await request(app).post('/api/orders').send(validOrder({ items: [{ slug: { $gt: '' }, qty: 1 }] })).expect(400)
    await request(app).post('/api/orders').set('Content-Type', 'application/json').send('{bad').expect(400)
    await request(app).get('/api/products?category[$ne]=x').expect(200)
    assert.equal(await Order.countDocuments(), 0)
  })

  it('limits one connection to 10 order attempts per 15 minutes', async () => {
    process.env.NODE_ENV = 'development'
    try {
      const bad = { items: [] }
      for (let i = 0; i < 10; i++) await request(app).post('/api/orders').send(bad).expect(400)
      const res = await request(app).post('/api/orders').send(bad).expect(429)
      assert.match(res.body.error, /Too many orders/)
    } finally {
      process.env.NODE_ENV = 'test'
    }
  })
})

describe('app', () => {
  it('reports health and 404s unknown routes as JSON', async () => {
    const health = await request(app).get('/api/health').expect(200)
    assert.equal(health.body.db, 'connected')
    const missing = await request(app).get('/api/nope').expect(404)
    assert.ok(missing.body.error)
  })
})
