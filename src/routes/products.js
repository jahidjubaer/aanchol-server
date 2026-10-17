import { Router } from 'express'
import { Product } from '../models/Product.js'
import { liveCategorySlugs } from '../services/categories.js'
import { getCurrentCampaign, withSalePrice } from '../services/pricing.js'
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

// GET /api/products/rokto-kolka-jamdani
productsRouter.get('/:slug', async (req, res) => {
  const [product, campaign] = await Promise.all([
    liveFilter().then((filter) => Product.findOne({ ...filter, slug: req.params.slug })),
    getCurrentCampaign(),
  ])
  if (!product) throw new HttpError(404, 'Product not found.')
  res.json({ product: withSalePrice(product, campaign) })
})
