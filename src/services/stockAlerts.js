import { isValidObjectId } from 'mongoose'
import { Product } from '../models/Product.js'
import { StockAlert } from '../models/StockAlert.js'
import { HttpError } from '../utils/httpError.js'
import { normalizePhone, PHONE_ERROR } from '../utils/phone.js'
import { liveCategorySlugs } from './categories.js'

// A shopper asks to hear when a sold-out piece is back. Asking again with the same number is fine.
export async function requestStockAlert(slug, body, customer) {
  const product = await Product.findOne({ slug: String(slug), active: true, category: { $in: await liveCategorySlugs() } })
  if (!product) throw new HttpError(404, 'Product not found.')
  if (product.stock > 0) throw new HttpError(409, 'Good news: this piece is in stock now.')

  const phone = normalizePhone(body?.phone ?? customer?.phone)
  if (!phone) throw new HttpError(400, 'Please check your number.', { fields: { phone: PHONE_ERROR } })
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : ''

  await StockAlert.updateOne(
    { product: product.slug, phone, open: true },
    { $setOnInsert: { name: name || customer?.name || undefined, customerId: customer?._id } },
    { upsert: true },
  ).catch((err) => {
    if (err?.code !== 11000) throw err // two taps at once: the first one already saved it
  })
}

// Open requests grouped by piece. Pieces back in stock come first: those people can be told now.
export async function listStockAlerts() {
  const groups = await StockAlert.aggregate([
    { $match: { open: true } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: '$product', waiting: { $push: { id: '$_id', phone: '$phone', name: '$name', createdAt: '$createdAt' } } } },
  ])
  const products = await Product.find({ slug: { $in: groups.map((g) => g._id) } }, 'slug name stock images colors active')
  const bySlug = new Map(products.map((p) => [p.slug, p]))

  return groups
    .map((g) => {
      const p = bySlug.get(g._id)
      return {
        product: p ? { slug: p.slug, name: p.name, stock: p.stock, image: p.images[0] ?? null, colors: p.colors, active: p.active } : { slug: g._id, name: g._id, stock: 0, image: null, active: false },
        waiting: g.waiting.map((w) => ({ ...w, id: String(w.id), name: w.name ?? '' })),
      }
    })
    .sort((a, b) => (b.product.stock > 0) - (a.product.stock > 0) || b.waiting.length - a.waiting.length)
}

// For the admin tab badge: people who can be told right now.
export async function countReadyAlerts() {
  const inStock = await Product.find({ stock: { $gt: 0 }, active: true }, 'slug').lean()
  return StockAlert.countDocuments({ open: true, product: { $in: inStock.map((p) => p.slug) } })
}

export async function closeStockAlert(id) {
  const alert = isValidObjectId(id) ? await StockAlert.findOneAndUpdate({ _id: id, open: true }, { $set: { open: false, notifiedAt: new Date() } }) : null
  if (!alert) throw new HttpError(404, 'This request was already handled.')
}
