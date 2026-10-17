// Bangladeshi mobile numbers are stored as 01XXXXXXXXX.
const BD_MOBILE = /^(?:\+?88)?(01[3-9]\d{8})$/
// The 011 range has no operator, so sample accounts use it: no real person can ever own one.
const SAMPLE_RANGE = /^(?:\+?88)?(011\d{8})$/

const clean = (value) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : '')

// A real number a customer can sign up or order with, or null.
export function normalizePhone(value) {
  return clean(value).match(BD_MOBILE)?.[1] ?? null
}

// Also accepts sample numbers, for signing in to the demo account.
export function normalizeLoginPhone(value) {
  const v = clean(value)
  return v.match(BD_MOBILE)?.[1] ?? v.match(SAMPLE_RANGE)?.[1] ?? null
}

export const PHONE_ERROR = 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.'
