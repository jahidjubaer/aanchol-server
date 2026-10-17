import { isCloudinaryUrl } from './cloudinary.js'

// Small field rules shared by every admin form. Each rule returns { value } or { error }.

export const isLocalPlaceholder = (url) => /^\/images\/[\w/.-]+\.(jpe?g|png|webp|avif)$/i.test(url)
export const isImageUrl = (url) => typeof url === 'string' && (isCloudinaryUrl(url) || isLocalPlaceholder(url))

export const optionalText = (max) => (v) => {
  if (v === undefined || v === null) return { value: '' }
  if (typeof v !== 'string') return { error: 'Must be text.' }
  const value = v.trim()
  return value.length > max ? { error: `Keep it under ${max} characters.` } : { value }
}

export const requiredText = (min, max, message) => (v) => {
  const result = optionalText(max)(v)
  if (result.error) return result
  return result.value.length < min ? { error: message } : result
}

export const wholeNumber = (min, max, message) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return Number.isInteger(n) && n >= min && n <= max ? { value: n } : { error: message }
}

export const optionalNumber = (min, max, message) => (v) =>
  v === undefined || v === null || v === '' ? { value: undefined } : wholeNumber(min, max, message)(v)

export const onOff = (v) => (typeof v === 'boolean' ? { value: v } : { error: 'Must be on or off.' })

export const oneOf = (options, message) => (v) => (options.includes(v) ? { value: v } : { error: message })

export const image = (message = 'Please add a photo.') => (v) =>
  isImageUrl(v) ? { value: v } : { error: v ? 'Photos must be uploaded through the admin.' : message }

export const optionalImage = (v) => (v === undefined || v === null || v === '' ? { value: '' } : image()(v))

// A page on this site ("/collections/jamdani") or a full https link.
export const optionalLink = (v) => {
  const result = optionalText(300)(v)
  if (result.error || !result.value) return result
  const ok = /^\/(?!\/)[\w\-./?=&#%]*$/.test(result.value) || /^https:\/\/[^\s]+$/.test(result.value)
  return ok ? result : { error: 'Use a page on this site like /collections/jamdani, or a link starting with https://' }
}

export const date = (message = 'Enter a valid date.') => (v) => {
  const d = new Date(v)
  return typeof v === 'string' && !Number.isNaN(d.getTime()) ? { value: d } : { error: message }
}

export const optionalDate = (v) => (v === undefined || v === null || v === '' ? { value: undefined } : date()(v))

// partial = true for edits: only the fields sent are checked and changed.
export function validateInput(body, rules, { partial = false, required = [] } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const errors = {}
  const value = {}

  for (const [field, rule] of Object.entries(rules)) {
    if (!(field in input)) {
      if (!partial && required.includes(field)) errors[field] = rule(undefined).error ?? 'Required.'
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

// Fields set to undefined (e.g. an old price removed) become a $unset.
export function toUpdate(value) {
  const set = { ...value }
  const unset = {}
  for (const [key, v] of Object.entries(set)) {
    if (v === undefined) {
      unset[key] = 1
      delete set[key]
    }
  }
  return { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
}
