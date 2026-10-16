import { MAX_PRODUCT_IMAGES, PRODUCT_CATEGORIES } from '../config/shop.js'
import { isCloudinaryUrl } from './cloudinary.js'

const HEX = /^#[0-9a-f]{6}$/i
const isLocalPlaceholder = (url) => /^\/images\/[\w/.-]+\.(jpe?g|png|webp|avif)$/i.test(url)

const optionalText = (max) => (v) => {
  if (v === undefined || v === null) return { value: '' }
  if (typeof v !== 'string') return { error: 'Must be text.' }
  const value = v.trim()
  return value.length > max ? { error: `Keep it under ${max} characters.` } : { value }
}
const requiredText = (min, max, message) => (v) => {
  const result = optionalText(max)(v)
  if (result.error) return result
  return result.value.length < min ? { error: message } : result
}
const wholeNumber = (min, max, message) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { error: message }
}
const optionalNumber = (min, max, message) => (v) =>
  v === undefined || v === null || v === '' ? { value: undefined } : wholeNumber(min, max, message)(v)

// One rule per editable field. Anything not listed here is ignored (e.g. slug changes, _id, timestamps).
const RULES = {
  name: requiredText(2, 100, 'Please enter a name.'),
  nameBangla: optionalText(100),
  category: (v) => (PRODUCT_CATEGORIES.includes(v) ? { value: v } : { error: 'Choose a category.' }),
  origin: optionalText(50),
  fabric: optionalText(50),
  color: optionalText(50),
  count: optionalNumber(0, 1000, 'Thread count must be a whole number.'),
  price: wholeNumber(1, 10_000_000, 'Enter the price in taka, e.g. 18500.'),
  compareAt: optionalNumber(1, 10_000_000, 'Enter the old price in taka, or leave it empty.'),
  badge: optionalText(30),
  images: (v) => {
    if (!Array.isArray(v)) return { error: 'Photos must be a list.' }
    if (v.length > MAX_PRODUCT_IMAGES) return { error: `Up to ${MAX_PRODUCT_IMAGES} photos.` }
    if (!v.every((u) => typeof u === 'string' && (isCloudinaryUrl(u) || isLocalPlaceholder(u))))
      return { error: 'Photos must be uploaded through the admin.' }
    return { value: [...new Set(v)] }
  },
  colors: (v) =>
    v && HEX.test(v.base) && HEX.test(v.motif)
      ? { value: { base: v.base.toLowerCase(), motif: v.motif.toLowerCase() } }
      : { error: 'Pick both colours.' },
  description: optionalText(2000),
  weavingTime: optionalText(50),
  weaver: optionalText(120),
  stock: wholeNumber(0, 999, 'Stock must be a whole number from 0.'),
  addedOn: (v) => {
    const date = new Date(v)
    return typeof v === 'string' && !Number.isNaN(date.getTime()) ? { value: date } : { error: 'Enter a valid date.' }
  },
  active: (v) => (typeof v === 'boolean' ? { value: v } : { error: 'Must be on or off.' }),
}

const REQUIRED_ON_CREATE = ['name', 'category', 'price', 'stock', 'colors']

// partial = true for edits: only the fields sent are checked and changed.
export function validateProductInput(body, { partial = false } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  const value = {}

  for (const [field, rule] of Object.entries(RULES)) {
    if (!(field in input)) {
      if (!partial && REQUIRED_ON_CREATE.includes(field)) errors[field] = rule(undefined).error ?? 'Required.'
      continue
    }
    const result = rule(input[field])
    if (result.error) errors[field] = result.error
    else value[field] = result.value
  }

  return { errors, value }
}

// Turns a name into a web address part: "Rokto Kolka Jamdani" → "rokto-kolka-jamdani".
export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}
