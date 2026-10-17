import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { Admin } from '../src/models/Admin.js'
import { Campaign } from '../src/models/Campaign.js'
import { Category } from '../src/models/Category.js'
import { HeroSlide } from '../src/models/HeroSlide.js'
import { Order } from '../src/models/Order.js'
import { Product } from '../src/models/Product.js'
import { SiteSettings } from '../src/models/SiteSettings.js'
import { upsertAdmin } from '../src/seed/admins.js'
import { ensureSiteDefaults } from '../src/seed/content.js'
import { seedProducts } from '../src/seed/seed.js'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters'

let mongo
let token
const app = createApp()
const auth = () => ({ Authorization: `Bearer ${token}` })
const IMG = 'https://res.cloudinary.com/aanchol/image/upload/v1/aanchol/products/hero.jpg'
const DAY = 24 * 60 * 60 * 1000
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString()

const eid = (overrides = {}) => ({
  name: 'Eid 2026',
  title: 'Eid Mubarak: 10% off',
  message: 'On every Jamdani until Eid.',
  percentOff: 10,
  categories: [],
  startsAt: iso(-1),
  endsAt: iso(5),
  ...overrides,
})

const order = (overrides = {}) => ({
  customer: { name: 'Nusrat Jahan', phone: '01712345678', city: 'Dhaka', address: 'House 12, Road 5, Dhanmondi' },
  delivery: 'inside-dhaka',
  items: [{ slug: 'ash-shapla-butidar-jamdani', qty: 1 }],
  ...overrides,
})

before(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri('aanchol-content-test'))
})
after(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => {
  await Promise.all(
    [Order, Admin, Product, Category, HeroSlide, Campaign, SiteSettings].map((m) => m.deleteMany({})),
  )
  await ensureSiteDefaults()
  await seedProducts()
  await upsertAdmin({ email: 'owner@aanchol.test', name: 'Owner', password: 'test-password-123' })
  token = (await request(app).post('/api/admin/login').send({ email: 'owner@aanchol.test', password: 'test-password-123' })).body.token
})

describe('site', () => {
  it('starts with the default categories, slides and home layout', async () => {
    const res = await request(app).get('/api/site').expect(200)
    assert.deepEqual(res.body.categories.map((c) => [c.slug, c.status]), [
      ['jamdani', 'live'],
      ['jewellery', 'coming-soon'],
      ['sarees', 'coming-soon'],
      ['three-piece', 'coming-soon'],
      ['orna-shawls', 'coming-soon'],
      ['nakshi-kantha', 'coming-soon'],
    ])
    // Upcoming lines stay out of the menu until the admin turns them on.
    assert.deepEqual(res.body.categories.filter((c) => c.inNav).map((c) => c.slug), ['jamdani', 'jewellery'])
    assert.equal(res.body.slides.length, 2)
    assert.ok(res.body.slides[0].id)
    assert.equal(res.body.campaign, null)
    assert.equal(res.body.homeSections[0].id, 'promise-strip')
    assert.equal(res.body.announcement.length, 2)
  })

  it('fills an empty database only once', async () => {
    await HeroSlide.deleteMany({})
    assert.equal(await ensureSiteDefaults(), false)
    assert.equal(await HeroSlide.countDocuments(), 0)
  })

  it('admin routes need a login', async () => {
    for (const path of ['/categories', '/slides', '/campaigns', '/settings']) {
      await request(app).get(`/api/admin${path}`).expect(401)
    }
  })
})

describe('categories', () => {
  it('adds a new product line and keeps its web address fixed', async () => {
    const res = await request(app)
      .post('/api/admin/categories')
      .set(auth())
      .send({ name: 'Dhakai Muslin', nameBangla: 'ঢাকাই মসলিন', status: 'coming-soon', order: 30, types: ['Plain', 'Embroidered'] })
      .expect(201)
    assert.equal(res.body.category.slug, 'dhakai-muslin')
    assert.deepEqual(res.body.category.types.map((t) => t.slug), ['plain', 'embroidered'])

    await request(app).post('/api/admin/categories').set(auth()).send({ name: 'Dhakai Muslin' }).expect(409)
    const edit = await request(app).patch('/api/admin/categories/dhakai-muslin').set(auth()).send({ slug: 'x', name: 'Muslin' }).expect(200)
    assert.equal(edit.body.category.slug, 'dhakai-muslin')
    assert.equal(edit.body.category.name, 'Muslin')
  })

  it('shows products only while their category is live', async () => {
    await request(app).patch('/api/admin/categories/jamdani').set(auth()).send({ status: 'coming-soon' }).expect(200)
    assert.equal((await request(app).get('/api/products').expect(200)).body.products.length, 0)
    await request(app).get('/api/products/rongdhonu-jamdani').expect(404)
    await request(app).post('/api/orders').send(order()).expect(409)

    await request(app).patch('/api/admin/categories/jamdani').set(auth()).send({ status: 'hidden' }).expect(200)
    const site = await request(app).get('/api/site').expect(200)
    assert.ok(!site.body.categories.some((c) => c.slug === 'jamdani'))
  })

  it('can only delete a category without products', async () => {
    await request(app).delete('/api/admin/categories/jamdani').set(auth()).expect(409)
    await request(app).delete('/api/admin/categories/jewellery').set(auth()).expect(204)
  })

  it('checks product category and type, and keeps used types', async () => {
    const product = {
      name: 'Mango Wood Jhumka',
      category: 'jewellery',
      type: 'wood',
      price: 1800,
      stock: 4,
      colors: { base: '#6b4a2b', motif: '#d9b56a' },
      details: [{ label: 'Material', value: 'Mango wood' }, { label: '', value: '' }],
    }
    const bad = await request(app).post('/api/admin/products').set(auth()).send({ ...product, type: 'plastic' }).expect(400)
    assert.ok(bad.body.fields.type)
    const created = await request(app).post('/api/admin/products').set(auth()).send(product).expect(201)
    assert.deepEqual(created.body.product.details, [{ label: 'Material', value: 'Mango wood' }])

    const res = await request(app)
      .patch('/api/admin/categories/jewellery')
      .set(auth())
      .send({ types: [{ slug: 'carved', label: 'Carved' }] })
      .expect(409)
    assert.match(res.body.fields.types, /Wood/)
    // Renaming keeps the slug, so the product stays linked.
    await request(app)
      .patch('/api/admin/categories/jewellery')
      .set(auth())
      .send({ types: [{ slug: 'wood', label: 'Wooden' }, { slug: 'carved', label: 'Carved' }] })
      .expect(200)
  })
})

describe('hero slides', () => {
  it('validates photos, links and buttons', async () => {
    const res = await request(app)
      .post('/api/admin/slides')
      .set(auth())
      .send({ image: 'https://evil.example/a.jpg', title: 'Eid', ctaLabel: 'Shop', ctaLink: 'javascript:alert(1)' })
      .expect(400)
    assert.ok(res.body.fields.image)
    assert.ok(res.body.fields.ctaLink)
  })

  it('shows a slide only while active and inside its dates', async () => {
    await HeroSlide.deleteMany({})
    await request(app).post('/api/admin/slides').set(auth()).send({ image: IMG, title: 'Always' }).expect(201)
    await request(app).post('/api/admin/slides').set(auth()).send({ image: IMG, title: 'Later', startsAt: iso(3) }).expect(201)
    await request(app).post('/api/admin/slides').set(auth()).send({ image: IMG, title: 'Ended', endsAt: iso(-1) }).expect(201)
    const off = await request(app).post('/api/admin/slides').set(auth()).send({ image: IMG, title: 'Off', active: false }).expect(201)
    assert.equal(off.body.slide.overlay, 45)

    const site = await request(app).get('/api/site').expect(200)
    assert.deepEqual(site.body.slides.map((s) => s.title), ['Always'])
    assert.equal((await request(app).get('/api/admin/slides').set(auth()).expect(200)).body.slides.length, 4)
  })

  it('edits and deletes a slide', async () => {
    const [first] = (await request(app).get('/api/admin/slides').set(auth())).body.slides
    const res = await request(app).patch(`/api/admin/slides/${first.id}`).set(auth()).send({ overlay: 70, align: 'center' }).expect(200)
    assert.equal(res.body.slide.overlay, 70)
    await request(app).patch(`/api/admin/slides/${first.id}`).set(auth()).send({ cta2Link: '' }).expect(400)
    await request(app).delete(`/api/admin/slides/${first.id}`).set(auth()).expect(204)
    await request(app).get('/api/admin/slides/not-an-id').set(auth()).expect(404)
  })
})

describe('campaigns', () => {
  it('shows the running campaign and discounts prices', async () => {
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid()).expect(201)
    const site = await request(app).get('/api/site').expect(200)
    assert.equal(site.body.campaign.percentOff, 10)
    assert.equal(site.body.campaign.name, undefined)
    assert.ok(site.body.campaign.version)

    const res = await request(app).get('/api/products/ash-shapla-butidar-jamdani').expect(200)
    assert.equal(res.body.product.price, 11200)
    assert.equal(res.body.product.salePrice, 10080)
  })

  it('charges the sale price at checkout and records the discount', async () => {
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid()).expect(201)
    const res = await request(app).post('/api/orders').send(order({ expectedSubtotal: 10080 })).expect(201)
    assert.equal(res.body.order.subtotal, 10080)
    assert.equal(res.body.order.items[0].price, 10080)
    assert.equal(res.body.order.items[0].listPrice, 11200)
    assert.equal(res.body.order.campaign.percentOff, 10)
  })

  it('refuses an order when the price changed since the bag was shown', async () => {
    // The customer saw the sale price, but the sale has just ended.
    const res = await request(app).post('/api/orders').send(order({ expectedSubtotal: 10080 })).expect(409)
    assert.equal(res.body.code, 'PRICE_CHANGED')
    assert.equal(res.body.subtotal, 11200)
    assert.equal(await Order.countDocuments(), 0)
    assert.equal((await Product.findOne({ slug: 'ash-shapla-butidar-jamdani' })).stock, 2)
  })

  it('only discounts the chosen categories', async () => {
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid({ categories: ['jewellery'] })).expect(201)
    const res = await request(app).get('/api/products/ash-shapla-butidar-jamdani').expect(200)
    assert.equal(res.body.product.salePrice, undefined)
  })

  it('ignores future, past and switched-off campaigns', async () => {
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid({ startsAt: iso(2), endsAt: iso(4) })).expect(201)
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid({ startsAt: iso(-5), endsAt: iso(-3) })).expect(201)
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid({ active: false })).expect(201)
    assert.equal((await request(app).get('/api/site')).body.campaign, null)
  })

  it('refuses overlapping campaigns and impossible discounts', async () => {
    await request(app).post('/api/admin/campaigns').set(auth()).send(eid()).expect(201)
    const clash = await request(app).post('/api/admin/campaigns').set(auth()).send(eid({ name: 'Puja', startsAt: iso(2), endsAt: iso(9) })).expect(409)
    assert.match(clash.body.fields.startsAt, /Eid 2026/)

    const bad = await request(app)
      .post('/api/admin/campaigns')
      .set(auth())
      .send(eid({ percentOff: 95, endsAt: iso(-2), categories: ['nope'] }))
      .expect(400)
    assert.ok(bad.body.fields.percentOff)
    assert.ok(bad.body.fields.endsAt)
  })

  it('edits a campaign without clashing with itself', async () => {
    const { body } = await request(app).post('/api/admin/campaigns').set(auth()).send(eid()).expect(201)
    const res = await request(app).patch(`/api/admin/campaigns/${body.campaign.id}`).set(auth()).send({ percentOff: 15 }).expect(200)
    assert.equal(res.body.campaign.percentOff, 15)
    await request(app).delete(`/api/admin/campaigns/${body.campaign.id}`).set(auth()).expect(204)
  })
})

describe('settings', () => {
  it('reorders and hides home sections and edits the announcement', async () => {
    const { body } = await request(app).get('/api/admin/settings').set(auth()).expect(200)
    const sections = [...body.settings.homeSections].reverse().map((s) => ({ ...s, visible: s.id !== 'craft' }))
    await request(app)
      .patch('/api/admin/settings')
      .set(auth())
      .send({ homeSections: sections, announcement: ['Eid delivery until the 25th', ''] })
      .expect(200)

    const site = await request(app).get('/api/site').expect(200)
    assert.equal(site.body.homeSections[0].id, 'promises')
    assert.equal(site.body.homeSections.find((s) => s.id === 'craft').visible, false)
    assert.deepEqual(site.body.announcement, ['Eid delivery until the 25th'])

    await request(app).patch('/api/admin/settings').set(auth()).send({ homeSections: [{ id: 'craft' }] }).expect(400)
  })
})
