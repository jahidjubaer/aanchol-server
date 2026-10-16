import { randomInt } from 'node:crypto'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { HttpError } from '../utils/httpError.js'
import { slugify, validateProductInput } from '../utils/validateProduct.js'

// The admin also sees hidden products and when they were last changed.
export function toAdminProductJSON(product) {
  return { ...product.toJSON(), active: product.active, updatedAt: product.updatedAt }
}

function checkPrices({ price, compareAt }) {
  if (compareAt !== undefined && price !== undefined && compareAt <= price) {
    throw new HttpError(400, 'Please check the product.', {
      fields: { compareAt: 'The old price must be higher than the price.' },
    })
  }
}

async function uniqueSlug(name) {
  const base = slugify(name) || 'product'
  if (!(await Product.exists({ slug: base }))) return base
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomInt(100, 1000)}`
    if (!(await Product.exists({ slug: candidate }))) return candidate
  }
  throw new HttpError(409, 'Could not create a web address for this name. Try a different name.')
}

export async function listAdminProducts() {
  const products = await Product.find().sort({ addedOn: -1 })
  return products.map(toAdminProductJSON)
}

export async function getAdminProduct(slug) {
  const product = await Product.findOne({ slug: String(slug) })
  if (!product) throw new HttpError(404, 'Product not found.')
  return product
}

export async function createProduct(body) {
  const { errors, value } = validateProductInput(body)
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the product.', { fields: errors })
  checkPrices(value)
  return Product.create({ ...value, slug: await uniqueSlug(value.name) })
}

export async function updateProduct(slug, body) {
  const product = await getAdminProduct(slug)
  const { errors, value } = validateProductInput(body, { partial: true })
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the product.', { fields: errors })

  checkPrices({ price: value.price ?? product.price, compareAt: 'compareAt' in value ? value.compareAt : product.compareAt })

  const unset = {}
  for (const [key, v] of Object.entries(value)) {
    if (v === undefined) {
      unset[key] = 1 // e.g. old price removed
      delete value[key]
    }
  }
  const updated = await Product.findByIdAndUpdate(
    product._id,
    { $set: value, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { returnDocument: 'after', runValidators: true },
  )
  return updated
}

// Products that were ever ordered can only be hidden, so old orders still make sense.
export async function deleteProduct(slug) {
  const product = await getAdminProduct(slug)
  if (await Order.exists({ 'items.product': product._id })) {
    throw new HttpError(409, 'This product has orders, so it can only be hidden, not deleted.')
  }
  await product.deleteOne()
}
