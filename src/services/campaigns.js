import { isValidObjectId } from 'mongoose'
import { MAX_PERCENT_OFF } from '../config/shop.js'
import { Campaign } from '../models/Campaign.js'
import { Category } from '../models/Category.js'
import { HttpError } from '../utils/httpError.js'
import {
  date,
  onOff,
  optionalImage,
  optionalLink,
  optionalText,
  requiredText,
  toUpdate,
  validateInput,
  wholeNumber,
} from '../utils/validate.js'

const RULES = {
  name: requiredText(2, 80, 'Give the campaign a name, e.g. Eid ul-Adha 2026.'),
  title: requiredText(2, 80, 'Please enter the headline customers see.'),
  titleBangla: optionalText(80),
  message: optionalText(300),
  image: optionalImage,
  ctaLabel: optionalText(30),
  ctaLink: optionalLink,
  percentOff: wholeNumber(0, MAX_PERCENT_OFF, `Enter 0 to ${MAX_PERCENT_OFF}. Use 0 for an announcement without a discount.`),
  categories: (v) =>
    Array.isArray(v) && v.every((s) => typeof s === 'string' && /^[a-z0-9-]{1,40}$/.test(s))
      ? { value: [...new Set(v)] }
      : { error: 'Choose categories from the list.' },
  startsAt: date('Choose when it starts.'),
  endsAt: date('Choose when it ends.'),
  popup: onOff,
  active: onOff,
}

async function validate(body, partial, current = {}) {
  const { errors, value } = validateInput(body, RULES, {
    partial,
    required: ['name', 'title', 'percentOff', 'startsAt', 'endsAt'],
  })
  const merged = { ...current, ...value }
  if (merged.startsAt && merged.endsAt && merged.endsAt <= merged.startsAt) errors.endsAt = 'The end must be after the start.'
  if (Boolean(merged.ctaLabel) !== Boolean(merged.ctaLink)) errors.ctaLink ??= 'Give the button both a label and a link.'
  if (value.categories?.length) {
    const found = await Category.countDocuments({ slug: { $in: value.categories } })
    if (found !== value.categories.length) errors.categories = 'One of these categories no longer exists.'
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the campaign.', { fields: errors })

  // Only one campaign may run at a time, so a price is never discounted twice.
  if (merged.active !== false) {
    const clash = await Campaign.findOne({
      _id: { $ne: current._id },
      active: true,
      startsAt: { $lt: merged.endsAt },
      endsAt: { $gt: merged.startsAt },
    })
    if (clash) {
      throw new HttpError(409, 'Please check the campaign.', {
        fields: { startsAt: `These dates overlap with "${clash.name}". Change the dates or turn that one off.` },
      })
    }
  }
  return value
}

export const listCampaigns = () => Campaign.find().sort({ startsAt: -1 })

export async function getCampaign(id) {
  const campaign = isValidObjectId(id) ? await Campaign.findById(id) : null
  if (!campaign) throw new HttpError(404, 'Campaign not found.')
  return campaign
}

export async function createCampaign(body) {
  return Campaign.create(await validate(body, false))
}

export async function updateCampaign(id, body) {
  const campaign = await getCampaign(id)
  const value = await validate(body, true, campaign.toObject())
  return Campaign.findByIdAndUpdate(campaign._id, toUpdate(value), { returnDocument: 'after', runValidators: true })
}

// Orders keep their own copy of the discount, so deleting a past campaign is safe.
export async function deleteCampaign(id) {
  const campaign = await getCampaign(id)
  await campaign.deleteOne()
}
