import mongoose from 'mongoose'
import { Order } from '../models/Order.js'
import { Product } from '../models/Product.js'
import { HttpError } from '../utils/httpError.js'
import { makeOrderNumber } from '../utils/orderNumber.js'
import { liveCategorySlugs } from './categories.js'
import { findUsableCard, refundGiftCard, renameGiftCardUse, spendGiftCard } from './giftCards.js'
import { deliveredSpend, memberDiscount, tierFor } from './membership.js'
import { campaignApplies, getCurrentCampaign, priceFor } from './pricing.js'
import { getSettings } from './siteSettings.js'

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

// account: the signed-in customer, if any (their membership level gives the member discount).
export async function createOrder({ customer, delivery, items, expectedSubtotal, expectedTotal, giftWrap, giftCardCode, account }) {
  const [products, campaign, settings, spent] = await Promise.all([
    liveCategorySlugs().then((live) =>
      Product.find({ slug: { $in: items.map((i) => i.slug) }, active: true, category: { $in: live } }),
    ),
    getCurrentCampaign(),
    getSettings(),
    account ? deliveredSpend(account._id) : 0,
  ])
  const bySlug = new Map(products.map((p) => [p.slug, p]))

  const problems = items
    .map((i) => ({ slug: i.slug, wanted: i.qty, available: bySlug.get(i.slug)?.stock ?? 0 }))
    .filter((p) => p.available < p.wanted)
  if (problems.length) {
    throw new HttpError(409, 'Some items in your bag are no longer available in that quantity.', {
      items: problems.map(({ slug, available }) => ({ slug, available })),
    })
  }

  const lines = items.map((i) => {
    const product = bySlug.get(i.slug)
    return { product, qty: i.qty, price: priceFor(product, campaign) }
  })
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  // The bag showed a different total, e.g. a sale ended while checking out. Nothing is charged
  // until the customer has seen the new prices.
  if (expectedSubtotal !== undefined && expectedSubtotal !== subtotal) {
    throw new HttpError(409, 'Prices have changed since you opened your bag. Please check the new total.', {
      code: 'PRICE_CHANGED',
      subtotal,
    })
  }

  if (giftWrap && !settings.giftWrap.enabled) {
    throw new HttpError(409, 'Sorry, gift wrap is not available right now.', { fields: { giftWrap: 'Gift wrap is not available right now.' } })
  }
  const tier = account ? tierFor(spent, settings.memberTiers) : null
  const member = tier && { tier: tier.name, percent: tier.percent, discount: memberDiscount(subtotal, tier) }
  const wrap = giftWrap && { message: giftWrap.message, fee: settings.giftWrap.fee }
  const beforeCard = subtotal - (member?.discount ?? 0) + delivery.fee + (wrap?.fee ?? 0)

  // Same idea for the whole total: a member level, gift wrap fee or delivery changed while checking out.
  if (expectedTotal !== undefined && expectedTotal !== beforeCard) {
    throw new HttpError(409, 'Your total has changed since you opened checkout. Please check the new total.', {
      code: 'PRICE_CHANGED',
      subtotal,
      memberPercent: member?.percent ?? 0,
      giftWrapFee: settings.giftWrap.fee,
    })
  }

  // The card pays as much of the total as its balance allows; cash on delivery covers the rest.
  const card = giftCardCode ? await findUsableCard(giftCardCode) : null
  const fromCard = card ? Math.min(card.balance, beforeCard) : 0

  const reserved = await reserveStock(lines)
  const discounted = lines.some((l) => campaignApplies(campaign, l.product))
  const orderId = new mongoose.Types.ObjectId()
  let orderNumber = makeOrderNumber()
  if (fromCard > 0) {
    try {
      await spendGiftCard(card.code, fromCard, { _id: orderId, orderNumber })
    } catch (err) {
      await releaseStock(reserved)
      throw err
    }
  }
  const undo = async () => {
    await releaseStock(reserved)
    if (fromCard > 0) await refundGiftCard(card.code, orderId)
  }

  const order = {
    _id: orderId,
    items: lines.map((l) => ({
      product: l.product._id,
      slug: l.product.slug,
      name: l.product.name,
      price: l.price,
      ...(l.price !== l.product.price ? { listPrice: l.product.price } : {}),
      qty: l.qty,
    })),
    subtotal,
    ...(discounted ? { campaign: { name: campaign.name, title: campaign.title, percentOff: campaign.percentOff } } : {}),
    ...(member ? { member } : {}),
    ...(wrap ? { giftWrap: wrap } : {}),
    ...(fromCard > 0 ? { giftCard: { code: card.code, amount: fromCard } } : {}),
    delivery: { id: delivery.id, label: delivery.label, eta: delivery.eta, fee: delivery.fee },
    total: beforeCard - fromCard,
    payment: { method: 'cod', paid: false },
    customer,
    ...(account ? { customerId: account._id } : {}),
  }

  // Order numbers are random; on the rare clash, try a new one.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await Order.create({ ...order, orderNumber })
      if (fromCard > 0 && attempt > 0) await renameGiftCardUse(card.code, orderId, orderNumber)
      return created
    } catch (err) {
      if (err?.code === 11000 && err.keyPattern?.orderNumber) {
        orderNumber = makeOrderNumber()
        continue
      }
      await undo()
      throw err
    }
  }
  await undo()
  throw new HttpError(503, 'Could not create the order. Please try again.')
}
