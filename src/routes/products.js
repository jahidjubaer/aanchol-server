import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { optionalCustomer } from '../middleware/customerAuth.js'
import { Product } from '../models/Product.js'
import { liveCategorySlugs } from '../services/categories.js'
import { getCurrentCampaign, withSalePrice } from '../services/pricing.js'
import { requestStockAlert } from '../services/stockAlerts.js'
import { HttpError } from '../utils/httpError.js'

export const productsRouter = Router()

// Only products in live categories are sold; coming-soon and hidden categories show none.
async function liveFilter() {
  return { active: true, category: { $in: await liveCategorySlugs() } }
}

// GET /api/products?category=jamdani
productsRouter.get('/', async (req, res) => {
  const filter = await liveFilter()
  if (typeof req.query.category === 'string') filter.category = { $in: filter.category.$in.filter((s) => s === req.query.category) }
  const [products, campaign] = await Promise.all([Product.find(filter).sort({ addedOn: -1 }), getCurrentCampaign()])
  res.json({ products: products.map((p) => withSalePrice(p, campaign)) })
})

const notifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many requests. Please wait a little and try again.' },
})

// POST /api/products/rokto-kolka-jamdani/notify  { phone, name? }  — "tell me when it's back"
productsRouter.post('/:slug/notify', notifyLimiter, optionalCustomer, async (req, res) => {
  await requestStockAlert(req.params.slug, req.body, req.customer)
  res.status(201).json({ ok: true })
})

// GET /api/products/rokto-kolka-jamdani
productsRouter.get('/:slug', async (req, res) => {
  const [product, campaign] = await Promise.all([
    liveFilter().then((filter) => Product.findOne({ ...filter, slug: req.params.slug })),
    getCurrentCampaign(),
  ])
  if (!product) throw new HttpError(404, 'Product not found.')
  res.json({ product: withSalePrice(product, campaign) })
})
