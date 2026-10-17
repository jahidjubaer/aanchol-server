import { HOME_SECTIONS, MAX_ANNOUNCEMENTS } from '../config/shop.js'
import { SiteSettings } from '../models/SiteSettings.js'
import { HttpError } from '../utils/httpError.js'
import { optionalText, validateInput } from '../utils/validate.js'

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
  }
}

export async function updateSettings(body) {
  const { errors, value } = validateInput(body, RULES, { partial: true })
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check the settings.', { fields: errors })
  await SiteSettings.updateOne({ key: 'site' }, { $set: value }, { upsert: true, runValidators: true })
  return getSettings()
}
