import { randomInt } from 'node:crypto'
import { Customer } from '../models/Customer.js'
import { Order } from '../models/Order.js'
import { getSettings } from './siteSettings.js'

// What a customer has spent on delivered orders, all time: the goods after every discount.
// Delivery and gift wrap don't count. Cancelled or undelivered orders never raise a level.
export async function deliveredSpend(customerId) {
  const [row] = await Order.aggregate([
    { $match: { customerId, status: 'delivered' } },
    { $group: { _id: null, spent: { $sum: { $subtract: ['$subtotal', { $ifNull: ['$member.discount', 0] }] } } } },
  ])
  return row?.spent ?? 0
}

// Highest level the spend reaches (tiers sorted by min), or null.
export function tierFor(spent, tiers) {
  return [...tiers].reverse().find((t) => spent >= t.min) ?? null
}

// Member discount on a subtotal, rounded to whole taka.
export const memberDiscount = (subtotal, tier) => (tier ? Math.round((subtotal * tier.percent) / 100) : 0)

// 8 digits, e.g. "4821 7730", printed on the membership card.
async function newMemberNo() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const no = String(randomInt(10_000_000, 100_000_000))
    if (!(await Customer.exists({ memberNo: no }))) return no
  }
  throw new Error('Could not pick a member number')
}

// Everything the account page shows. The level is worked out fresh each time, so changes to the
// levels in the admin apply at once. A card number is given the first time a level is reached.
export async function getMembership(customer, tiers) {
  const levels = tiers ?? (await getSettings()).memberTiers
  const spent = await deliveredSpend(customer._id)
  const tier = tierFor(spent, levels)
  const next = levels.find((t) => t.min > spent) ?? null

  if (tier && !customer.memberNo) {
    const memberNo = await newMemberNo()
    const updated = await Customer.findOneAndUpdate(
      { _id: customer._id, memberNo: { $exists: false } },
      { $set: { memberNo, memberSince: new Date() } },
      { returnDocument: 'after' },
    )
    if (updated) {
      customer.memberNo = updated.memberNo
      customer.memberSince = updated.memberSince
    }
  }

  return {
    spent,
    tier,
    next: next && { ...next, remaining: next.min - spent },
    tiers: levels,
    memberNo: tier ? (customer.memberNo ?? null) : null,
    memberSince: tier ? (customer.memberSince ?? null) : null,
  }
}
