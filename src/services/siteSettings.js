import { DEFAULT_GIFT_WRAP, DEFAULT_MEMBER_TIERS, HOME_SECTIONS, MAX_ANNOUNCEMENTS, MAX_MEMBER_PERCENT, MAX_MEMBER_TIERS } from '../config/shop.js'
import { SiteSettings } from '../models/SiteSettings.js'
import { HttpError } from '../utils/httpError.js'
import { onOff, optionalText, requiredText, validateInput, wholeNumber } from '../utils/validate.js'

const SECTION_IDS = HOME_SECTIONS.map((s) => s.id)

// Saved order first, then any section added in a later version (shown, at the end).
export function resolveHomeSections(saved = []) {
  const known = saved.filter((s) => SECTION_IDS.includes(s.id))
  const missing = SECTION_IDS.filter((id) => !known.some((s) => s.id === id)).map((id) => ({ id, visible: true }))
  return [...known, ...missing].map(({ id, visible }) => ({ id, visible }))
}

const RULES = {
  announcement: (v) => {
    if (!Array.isArray(v)) return { error: 'Must be a list.' }
    const lines = []
    for (const line of v) {
      const result = optionalText(90)(line)
      if (result.error) return { error: 'Keep each line under 90 characters.' }
      if (result.value) lines.push(result.value)
    }
    return lines.length > MAX_ANNOUNCEMENTS ? { error: `Up to ${MAX_ANNOUNCEMENTS} lines.` } : { value: lines }
  },
  // Levels from the lowest spend up; each higher level must give a bigger discount.
  memberTiers: (v) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > MAX_MEMBER_TIERS) return { error: `Between 1 and ${MAX_MEMBER_TIERS} levels.` }
    const tiers = []
    for (const t of v) {
      const name = requiredText(2, 20, 'Give each level a name (up to 20 letters).')(t?.name)
      const min = wholeNumber(1, 10_000_000, 'Spend must be a whole number of taka.')(t?.min)
      const percent = wholeNumber(1, MAX_MEMBER_PERCENT, `Discount must be 1 to ${MAX_MEMBER_PERCENT}%.`)(t?.percent)
      const error = name.error ?? min.error ?? percent.error
      if (error) return { error }
      tiers.push({ name: name.value, min: min.value, percent: percent.value })
    }
    tiers.sort((a, b) => a.min - b.min)
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].min === tiers[i - 1].min) return { error: 'Two levels have the same spend.' }
      if (tiers[i].percent <= tiers[i - 1].percent) return { error: 'A level that needs more spend must give a bigger discount.' }
    }
    return { value: tiers }
  },
  giftWrap: (v) => {
    const enabled = onOff(v?.enabled)
    const fee = wholeNumber(0, 5000, 'Fee must be 0 to 5,000 taka.')(v?.fee)
    const error = enabled.error ?? fee.error
    return error ? { error } : { value: { enabled: enabled.value, fee: fee.value } }
  },
  homeSections: (v) => {
    if (!Array.isArray(v)) return { error: 'Must be a list.' }
    const ids = v.map((s) => s?.id)
    if (ids.length !== SECTION_IDS.length || !SECTION_IDS.every((id) => ids.includes(id))) {
      return { error: 'Send every home section once.' }
    }
    return { value: v.map((s) => ({ id: s.id, visible: s.visible !== false })) }
  },
}

export async function getSettings() {
  const settings = await SiteSettings.findOne({ key: 'site' })
  return {
    announcement: settings?.announcement ?? [],
    homeSections: resolveHomeSections(settings?.homeSections),
    memberTiers: settings?.memberTiers?.length ? settings.memberTiers.map(({ name, min, percent }) => ({ name, min, percent })) : DEFAULT_MEMBER_TIERS,
    giftWrap: typeof settings?.giftWrap?.enabled === 'boolean' ? { enabled: settings.giftWrap.enabled, fee: settings.giftWrap.fee } : DEFAULT_GIFT_WRAP,
  }
}

export async function updateSettings(body) {
  const { errors, value } = validateInput(body, RULES, { partial: true })
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the settings.', { fields: errors })
  await SiteSettings.updateOne({ key: 'site' }, { $set: value }, { upsert: true, runValidators: true })
  return getSettings()
}
