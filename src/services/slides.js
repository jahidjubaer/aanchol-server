import { isValidObjectId } from 'mongoose'
import { MAX_HERO_SLIDES } from '../config/shop.js'
import { HeroSlide } from '../models/HeroSlide.js'
import { HttpError } from '../utils/httpError.js'
import {
  image,
  onOff,
  oneOf,
  optionalDate,
  optionalImage,
  optionalLink,
  optionalText,
  requiredText,
  toUpdate,
  validateInput,
  wholeNumber,
} from '../utils/validate.js'

const RULES = {
  image: image('Please add a photo for this slide.'),
  mobileImage: optionalImage,
  imageAlt: optionalText(160),
  eyebrow: optionalText(50),
  title: requiredText(2, 60, 'Please enter a title.'),
  titleAccent: optionalText(60),
  bangla: optionalText(60),
  text: optionalText(220),
  ctaLabel: optionalText(30),
  ctaLink: optionalLink,
  cta2Label: optionalText(30),
  cta2Link: optionalLink,
  overlay: wholeNumber(0, 90, 'Shade must be from 0 to 90.'),
  align: oneOf(['left', 'center'], 'Choose left or centre.'),
  order: wholeNumber(0, 999, 'Order must be a number from 0 to 999.'),
  active: onOff,
  startsAt: optionalDate,
  endsAt: optionalDate,
}

const half = (label, link) => Boolean(label) !== Boolean(link)

function validate(body, partial, current = {}) {
  const { errors, value } = validateInput(body, RULES, { partial, required: ['image', 'title'] })
  const merged = { ...current, ...value }
  if (half(merged.ctaLabel, merged.ctaLink)) errors.ctaLink ??= 'Give the button both a label and a link.'
  if (half(merged.cta2Label, merged.cta2Link)) errors.cta2Link ??= 'Give the button both a label and a link.'
  if (merged.startsAt && merged.endsAt && merged.endsAt <= merged.startsAt) errors.endsAt = 'The end must be after the start.'
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the slide.', { fields: errors })
  return value
}

export const listSlides = () => HeroSlide.find().sort({ order: 1, createdAt: 1 })

export function listLiveSlides(now = new Date()) {
  return HeroSlide.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ],
  })
    .sort({ order: 1, createdAt: 1 })
    .limit(MAX_HERO_SLIDES)
}

export async function getSlide(id) {
  const slide = isValidObjectId(id) ? await HeroSlide.findById(id) : null
  if (!slide) throw new HttpError(404, 'Slide not found.')
  return slide
}

export async function createSlide(body) {
  if ((await HeroSlide.countDocuments()) >= MAX_HERO_SLIDES) {
    throw new HttpError(409, `Up to ${MAX_HERO_SLIDES} slides. Delete one first.`)
  }
  return HeroSlide.create(validate(body, false))
}

export async function updateSlide(id, body) {
  const slide = await getSlide(id)
  const value = validate(body, true, slide.toObject())
  return HeroSlide.findByIdAndUpdate(slide._id, toUpdate(value), { returnDocument: 'after', runValidators: true })
}

export async function deleteSlide(id) {
  const slide = await getSlide(id)
  await slide.deleteOne()
}
