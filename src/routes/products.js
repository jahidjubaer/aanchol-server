import { Router } from 'express'
import { Product } from '../models/Product.js'
import { HttpError } from '../utils/httpError.js'

export const productsRouter = Router()

// GET /api/products?category=jamdani
productsRouter.get('/', async (req, res) => {
  const filter = { active: true }
  if (typeof req.query.category === 'string') filter.category = req.query.category
  const products = await Product.find(filter).sort({ addedOn: -1 })
  res.json({ products })
})

// GET /api/products/rokto-kolka-jamdani
productsRouter.get('/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, active: true })
  if (!product) throw new HttpError(404, 'Product not found.')
  res.json({ product })
})
