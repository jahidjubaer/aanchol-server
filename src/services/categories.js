import { CATEGORY_STATUSES, CATEGORY_TEMPLATES, MAX_CATEGORY_TYPES } from '../config/shop.js'
import { Category } from '../models/Category.js'
import { Product } from '../models/Product.js'
import { HttpError } from '../utils/httpError.js'
import {
  onOff,
  oneOf,
  optionalImage,
  optionalText,
  requiredText,
  slugify,
  toUpdate,
  validateInput,
  wholeNumber,
} from '../utils/validate.js'

const SLUG = /^[a-z0-9-]{2,40}$/

const RULES = {
  name: requiredText(2, 60, 'Please enter a name.'),
  nameBangla: optionalText(60),
  intro: optionalText(400),
  banner: optionalImage,
  status: oneOf(CATEGORY_STATUSES, 'Choose live, coming soon or hidden.'),
  inNav: onOff,
  order: wholeNumber(0, 999, 'Order must be a number from 0 to 999.'),
  template: oneOf(CATEGORY_TEMPLATES, 'Choose a product form.'),
  // Each type keeps its slug when only the label is renamed, so products stay linked.
  types: (v) => {
    if (!Array.isArray(v)) return { error: 'Types must be a list.' }
    if (v.length > MAX_CATEGORY_TYPES) return { error: `Up to ${MAX_CATEGORY_TYPES} types.` }
    const types = []
    for (const t of v) {
      const label = optionalText(30)(typeof t === 'string' ? t : t?.label)
      if (label.error) return { error: 'Keep each type under 30 characters.' }
      if (!label.value) continue
      const slug = typeof t?.slug === 'string' && SLUG.test(t.slug) ? t.slug : slugify(label.value)
      if (!slug) return { error: `"${label.value}" needs some English letters for its web address.` }
      if (types.some((x) => x.slug === slug)) return { error: `"${label.value}" is listed twice.` }
      types.push({ slug, label: label.value })
    }
    return { value: types }
  },
}

function validate(body, partial) {
  const { errors, value } = validateInput(body, RULES, { partial, required: ['name'] })
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the category.', { fields: errors })
  return value
}

export const listCategories = () => Category.find().sort({ order: 1, createdAt: 1 })

export const listPublicCategories = () => Category.find({ status: { $ne: 'hidden' } }).sort({ order: 1, createdAt: 1 })

export const liveCategorySlugs = () => Category.distinct('slug', { status: 'live' })

export async function getCategory(slug) {
  const category = await Category.findOne({ slug: String(slug) })
  if (!category) throw new HttpError(404, 'Category not found.')
  return category
}

export async function createCategory(body) {
  const value = validate(body, false)
  const slug = typeof body?.slug === 'string' && body.slug ? body.slug.trim().toLowerCase() : slugify(value.name)
  if (!SLUG.test(slug)) {
    throw new HttpError(400, 'Please check the category.', {
      fields: { slug: 'Use 2 to 40 small English letters, numbers or dashes, e.g. dhakai-muslin.' },
    })
  }
  if (await Category.exists({ slug })) {
    throw new HttpError(409, 'Please check the category.', { fields: { slug: 'Another category already uses this web address.' } })
  }
  return Category.create({ ...value, slug })
}

export async function updateCategory(slug, body) {
  const category = await getCategory(slug)
  const value = validate(body, true)

  // A type that products still use can't be removed.
  if (value.types) {
    const kept = new Set(value.types.map((t) => t.slug))
    for (const t of category.types.filter((t) => !kept.has(t.slug))) {
      if (await Product.exists({ category: category.slug, type: t.slug })) {
        throw new HttpError(409, 'Please check the category.', {
          fields: { types: `Some products are still marked "${t.label}". Change them first.` },
        })
      }
    }
  }
  return Category.findByIdAndUpdate(category._id, toUpdate(value), { returnDocument: 'after', runValidators: true })
}

// Categories with products can only be hidden, so products and old links keep working.
export async function deleteCategory(slug) {
  const category = await getCategory(slug)
  if (await Product.exists({ category: category.slug })) {
    throw new HttpError(409, 'This category has products, so it can only be hidden, not deleted.')
  }
  await category.deleteOne()
}

// For the product form: field errors, or null when the category and type are fine.
export async function checkProductCategory(categorySlug, typeSlug) {
  const category = await Category.findOne({ slug: categorySlug })
  if (!category) return { category: 'Choose a category.' }
  if (typeSlug && !category.types.some((t) => t.slug === typeSlug)) return { type: 'Choose one of this category\'s types.' }
  return null
}
