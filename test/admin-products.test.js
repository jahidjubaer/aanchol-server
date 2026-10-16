import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { Admin } from '../src/models/Admin.js'
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { upsertAdmin } from '../src/seed/admins.js'
import { seedProducts } from '../src/seed/seed.js'
import { createUploadSignature, signParams } from '../src/utils/cloudinary.js'
import { slugify } from '../src/utils/validateProduct.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'

let mongo
let token
const app = createApp()
const auth = () => ({ Authorization: `Bearer ${token}` })
const IMG = 'https://res.cloudinary.com/aanchol/image/upload/v1/aanchol/products/abc.jpg'

const newProduct = (overrides = {}) => ({
  name: 'Nil Shapla Jamdani',
  nameBangla: 'নীল শাপলা জামদানি',
  category: 'jamdani',
  origin: 'Tangail',
  fabric: 'Cotton',
  count: 84,
  color: 'Blue',
  price: 12500,
  stock: 2,
  images: [IMG],
  colors: { base: '#1D2340', motif: '#d9b56a' },
  description: 'Indigo cotton with white shapla butis.',
  ...overrides,
})

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-products-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Promise.all([Order.deleteMany({}), Admin.deleteMany({}), Product.deleteMany({})])
  await seedProducts()
  await upsertAdmin({ email: 'owner@aanchol.test', name: 'Owner', password: 'test-password-123' })
  token = (await request(app).post('/api/admin/login').send({ email: 'owner@aanchol.test', password: 'test-password-123' })).body.token
})

describe('admin products', () => {
  it('needs a login', async () => {
    await request(app).get('/api/admin/products').expect(401)
    await request(app).post('/api/admin/products').send(newProduct()).expect(401)
  })

  it('lists every product, including hidden ones, with the active flag', async () => {
    await Product.updateOne({ slug: 'kacha-holud-jamdani' }, { active: false })
    const res = await request(app).get('/api/admin/products').set(auth()).expect(200)
    assert.equal(res.body.products.length, 6)
    assert.equal(res.body.products.find((p) => p.slug === 'kacha-holud-jamdani').active, false)
  })

  it('creates a product with a web address made from its name, visible in the shop', async () => {
    const res = await request(app).post('/api/admin/products').set(auth()).send(newProduct()).expect(201)
    assert.equal(res.body.product.slug, 'nil-shapla-jamdani')
    assert.equal(res.body.product.colors.base, '#1d2340')
    assert.equal(res.body.product.active, true)
    await request(app).get('/api/products/nil-shapla-jamdani').expect(200)

    const again = await request(app).post('/api/admin/products').set(auth()).send(newProduct()).expect(201)
    assert.match(again.body.product.slug, /^nil-shapla-jamdani-\d{3}$/)
  })

  it('explains what is wrong with field errors', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set(auth())
      .send({ name: 'N', category: 'shoes', price: 'cheap', stock: -1, images: ['https://evil.example/x.jpg'] })
      .expect(400)
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['category', 'colors', 'images', 'name', 'price', 'stock'])
  })

  it('needs the old price to be higher than the price', async () => {
    const res = await request(app).post('/api/admin/products').set(auth()).send(newProduct({ compareAt: 12000 })).expect(400)
    assert.ok(res.body.fields.compareAt)
    await request(app).patch('/api/admin/products/rongdhonu-jamdani').set(auth()).send({ price: 30000 }).expect(400)
  })

  it('edits only the fields sent, removes an old price, and never changes the web address', async () => {
    const res = await request(app)
      .patch('/api/admin/products/rongdhonu-jamdani')
      .set(auth())
      .send({ price: 23000, compareAt: null, stock: 3, slug: 'hacked', name: 'Rongdhonu Silk Jamdani' })
      .expect(200)
    const p = res.body.product
    assert.equal(p.slug, 'rongdhonu-jamdani')
    assert.equal(p.name, 'Rongdhonu Silk Jamdani')
    assert.equal(p.price, 23000)
    assert.equal(p.compareAt, undefined)
    assert.equal(p.stock, 3)
    assert.equal(p.fabric, 'Silk') // untouched
  })

  it('hides a product from the shop without deleting it', async () => {
    await request(app).patch('/api/admin/products/kacha-holud-jamdani').set(auth()).send({ active: false }).expect(200)
    await request(app).get('/api/products/kacha-holud-jamdani').expect(404)
    const shop = await request(app).get('/api/products')
    assert.equal(shop.body.products.length, 5)
  })

  it('deletes a never-ordered product, but only hides one that has orders', async () => {
    await request(app).delete('/api/admin/products/tara-buti-midnight-jamdani').set(auth()).expect(204)
    assert.equal(await Product.exists({ slug: 'tara-buti-midnight-jamdani' }), null)

    await request(app)
      .post('/api/orders')
      .send({
        customer: { name: 'Nusrat Jahan', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' },
        delivery: 'inside-dhaka',
        items: [{ slug: 'kacha-holud-jamdani', qty: 1 }],
      })
      .expect(201)
    const res = await request(app).delete('/api/admin/products/kacha-holud-jamdani').set(auth()).expect(409)
    assert.match(res.body.error, /hidden/)
  })
})

describe('photo uploads', () => {
  const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  afterEach(() => keys.forEach((k) => delete process.env[k]))

  it('reports uploads as off until Cloudinary keys are set', async () => {
    assert.equal((await request(app).get('/api/admin/uploads').set(auth())).body.enabled, false)
    await request(app).post('/api/admin/uploads/signature').set(auth()).expect(503)
  })

  it('signs uploads without ever sending the secret', async () => {
    Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'aanchol', CLOUDINARY_API_KEY: '1234', CLOUDINARY_API_SECRET: 'shh-secret' })
    assert.equal((await request(app).get('/api/admin/uploads').set(auth())).body.enabled, true)
    const res = await request(app).post('/api/admin/uploads/signature').set(auth()).expect(200)
    assert.equal(res.body.uploadUrl, 'https://api.cloudinary.com/v1_1/aanchol/image/upload')
    assert.equal(res.body.fields.api_key, '1234')
    assert.equal(res.body.fields.folder, 'aanchol/products')
    assert.ok(!JSON.stringify(res.body).includes('shh-secret'))
  })

  it('matches Cloudinary’s signature rule', () => {
    // Sorted "a=1&b=2" + secret, SHA-1.
    const expected = createHash('sha1').update('folder=x&timestamp=1315060510abcd').digest('hex')
    assert.equal(signParams({ timestamp: 1315060510, folder: 'x' }, 'abcd'), expected)
    const sig = createUploadSignature({ folder: 'x', apiKey: 'k', apiSecret: 'abcd', uploadUrl: 'u' }, 1315060510000)
    assert.equal(sig.fields.signature, expected)
  })

  it('makes clean web addresses', () => {
    assert.equal(slugify('  Rokto Kolka — Jamdani! '), 'rokto-kolka-jamdani')
    assert.equal(slugify('Café Muslin'), 'cafe-muslin')
    assert.equal(slugify('জামদানি'), '')
  })
})
