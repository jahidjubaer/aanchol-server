import { Product } from '../models/Product.js'
import { ensureDefaultCategories } from './content.js'
import { products } from './products.js'

// Inserts or updates the sample products by slug. Orders are never touched.
// Note: this resets each sample product's stock and price to the values in products.js.
// Their categories are added too if missing, since products only show in existing categories.
export async function seedProducts() {
  await ensureDefaultCategories()
  await Product.bulkWrite(
    products.map((p) => ({
      updateOne: { filter: { slug: p.slug }, update: { $set: { ...p, active: true } }, upsert: true },
    })),
  )
  await Product.syncIndexes()
  return products.length
}
