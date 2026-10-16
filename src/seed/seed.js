import { Product } from '../models/Product.js'
import { products } from './products.js'

// Inserts or updates the sample products by slug. Orders are never touched.
// Note: this resets each sample product's stock and price to the values in products.js.
export async function seedProducts() {
  await Product.bulkWrite(
    products.map((p) => ({
      updateOne: { filter: { slug: p.slug }, update: { $set: { ...p, active: true } }, upsert: true },
    })),
  )
  await Product.syncIndexes()
  return products.length
}
