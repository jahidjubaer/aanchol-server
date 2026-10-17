import { MAX_PAIRS, MAX_PRODUCT_DETAILS, MAX_PRODUCT_IMAGES } from '../config/shop.js'
import {
  date,
  isImageUrl,
  onOff,
  optionalNumber,
  optionalText,
  requiredText,
  validateInput,
  wholeNumber,
} from './validate.js'

export { slugify } from './validate.js'

const HEX = /^#[0-9a-f]{6}$/i
const SLUG = /^[a-z0-9-]{1,70}$/

// One rule per editable field. Anything not listed here is ignored (e.g. slug changes, _id, timestamps).
// Whether the category and type exist is checked against the database in services/adminProducts.js.
const RULES = {
  name: requiredText(2, 100, 'Please enter a name.'),
  nameBangla: optionalText(100),
  category: (v) => (typeof v === 'string' && SLUG.test(v) ? { value: v } : { error: 'Choose a category.' }),
  type: (v) => (v === '' || v === null || v === undefined ? { value: '' } : typeof v === 'string' && SLUG.test(v) ? { value: v } : { error: 'Choose a type.' }),
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
    if (!v.every(isImageUrl)) return { error: 'Photos must be uploaded through the admin.' }
    return { value: [...new Set(v)] }
  },
  colors: (v) =>
    v && HEX.test(v.base) && HEX.test(v.motif)
      ? { value: { base: v.base.toLowerCase(), motif: v.motif.toLowerCase() } }
      : { error: 'Pick both colours.' },
  // Free-form rows like "Material: Mango wood", for products that aren't saris.
  details: (v) => {
    if (!Array.isArray(v)) return { error: 'Details must be a list.' }
    if (v.length > MAX_PRODUCT_DETAILS) return { error: `Up to ${MAX_PRODUCT_DETAILS} detail rows.` }
    const rows = []
    for (const row of v) {
      const label = optionalText(40)(row?.label)
      const value = optionalText(120)(row?.value)
      if (label.error || value.error) return { error: 'Keep labels under 40 and values under 120 characters.' }
      if (!label.value && !value.value) continue
      if (!label.value || !value.value) return { error: 'Each detail needs a label and a value.' }
      rows.push({ label: label.value, value: value.value })
    }
    return { value: rows }
  },
  description: optionalText(2000),
  // "Complete the look": other pieces shown with this one. Missing or sold-out ones are skipped by the shop.
  pairsWith: (v) => {
    if (!Array.isArray(v) || !v.every((s) => typeof s === 'string' && SLUG.test(s))) return { error: 'Choose pieces from the list.' }
    const slugs = [...new Set(v)]
    return slugs.length > MAX_PAIRS ? { error: `Up to ${MAX_PAIRS} pieces.` } : { value: slugs }
  },
  weavingTime: optionalText(50),
  weaver: optionalText(120),
  stock: wholeNumber(0, 999, 'Stock must be a whole number from 0.'),
  addedOn: date(),
  active: onOff,
}

const REQUIRED_ON_CREATE = ['name', 'category', 'price', 'stock', 'colors']

export function validateProductInput(body, { partial = false } = {}) {
  return validateInput(body, RULES, { partial, required: REQUIRED_ON_CREATE })
}
