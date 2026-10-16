import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { HttpError } from '../utils/httpError.js'
import { makeOrderNumber } from '../utils/orderNumber.js'

// Takes stock only while enough is left, so two people can't both buy the last sari.
// Reserved stock is put back if a later step fails.
async function reserveStock(lines) {
  const reserved = []
  for (const line of lines) {
    const result = await Product.updateOne(
      { _id: line.product._id, active: true, stock: { $gte: line.qty } },
      { $inc: { stock: -line.qty } },
    )
    if (result.modifiedCount === 0) {
      await releaseStock(reserved)
      const fresh = await Product.findById(line.product._id, 'stock')
      throw new HttpError(409, `Sorry, ${line.product.name} has just sold out.`, {
        items: [{ slug: line.product.slug, available: fresh?.stock ?? 0 }],
      })
    }
    reserved.push(line)
  }
  return reserved
}

export function releaseStock(lines) {
  return Promise.all(lines.map((l) => Product.updateOne({ _id: l.product._id }, { $inc: { stock: l.qty } })))
}

export async function createOrder({ customer, delivery, items }) {
  const products = await Product.find({ slug: { $in: items.map((i) => i.slug) }, active: true })
  const bySlug = new Map(products.map((p) => [p.slug, p]))

  const problems = items
    .map((i) => ({ slug: i.slug, wanted: i.qty, available: bySlug.get(i.slug)?.stock ?? 0 }))
    .filter((p) => p.available < p.wanted)
  if (problems.length) {
    throw new HttpError(409, 'Some items in your bag are no longer available in that quantity.', {
      items: problems.map(({ slug, available }) => ({ slug, available })),
    })
  }

  const lines = items.map((i) => ({ product: bySlug.get(i.slug), qty: i.qty }))
  const reserved = await reserveStock(lines)

  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0)
  const order = {
    items: lines.map((l) => ({ product: l.product._id, slug: l.product.slug, name: l.product.name, price: l.product.price, qty: l.qty })),
    subtotal,
    delivery: { id: delivery.id, label: delivery.label, eta: delivery.eta, fee: delivery.fee },
    total: subtotal + delivery.fee,
    payment: { method: 'cod', paid: false },
    customer,
  }

  // Order numbers are random; on the rare clash, try a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await Order.create({ ...order, orderNumber: makeOrderNumber() })
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.orderNumber) continue
      await releaseStock(reserved)
      throw err
    }
  }
  await releaseStock(reserved)
  throw new HttpError(503, 'Could not create the order. Please try again.')
}
