import { Campaign } from '../models/Campaign.js'

// The campaign running right now, if any. Admin checks keep campaigns from overlapping.
export function getCurrentCampaign(now = new Date()) {
  return Campaign.findOne({ active: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ startsAt: -1 })
}

export function campaignApplies(campaign, product) {
  if (!campaign || !(campaign.percentOff > 0)) return false
  return campaign.categories.length === 0 || campaign.categories.includes(product.category)
}

// Rounded to whole taka.
export const discounted = (price, percentOff) => Math.round((price * (100 - percentOff)) / 100)

// What a customer pays for one piece right now.
export function priceFor(product, campaign) {
  return campaignApplies(campaign, product) ? discounted(product.price, campaign.percentOff) : product.price
}

// Public product JSON with the sale price added while a campaign covers it.
export function withSalePrice(product, campaign) {
  const json = product.toJSON()
  if (campaignApplies(campaign, product)) json.salePrice = discounted(product.price, campaign.percentOff)
  return json
}
