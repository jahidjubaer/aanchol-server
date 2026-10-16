import { Router } from 'express'
import { env } from '../config/env.js'
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  listAdminProducts,
  toAdminProductJSON,
  updateProduct,
} from '../services/adminProducts.js'
import { createUploadSignature } from '../utils/cloudinary.js'
import { HttpError } from '../utils/httpError.js'

// Mounted under /api/admin, after requireAdmin.
export const adminProductsRouter = Router()

adminProductsRouter.get('/products', async (_req, res) => {
  res.json({ products: await listAdminProducts() })
})

adminProductsRouter.get('/products/:slug', async (req, res) => {
  res.json({ product: toAdminProductJSON(await getAdminProduct(req.params.slug)) })
})

adminProductsRouter.post('/products', async (req, res) => {
  res.status(201).json({ product: toAdminProductJSON(await createProduct(req.body)) })
})

adminProductsRouter.patch('/products/:slug', async (req, res) => {
  res.json({ product: toAdminProductJSON(await updateProduct(req.params.slug, req.body)) })
})

adminProductsRouter.delete('/products/:slug', async (req, res) => {
  await deleteProduct(req.params.slug)
  res.status(204).end()
})

// GET: whether photo uploads are set up. POST: a one-time signature for uploading one photo.
adminProductsRouter.get('/uploads', (_req, res) => {
  res.json({ enabled: Boolean(env.cloudinary()) })
})

adminProductsRouter.post('/uploads/signature', (_req, res) => {
  const config = env.cloudinary()
  if (!config) throw new HttpError(503, 'Photo uploads are not set up yet (Cloudinary keys missing on the server).')
  res.json(createUploadSignature(config))
})
