import { Router } from 'express'
import { listPublicCategories } from '../services/categories.js'
import { getCurrentCampaign } from '../services/pricing.js'
import { getSettings } from '../services/siteSettings.js'
import { listLiveSlides } from '../services/slides.js'

export const siteRouter = Router()

// GET /api/site  →  everything the shop needs to draw its pages: categories, hero slides,
// the running campaign and the home page layout. One request, so the shop loads quickly.
siteRouter.get('/', async (_req, res) => {
  const [categories, slides, campaign, settings] = await Promise.all([
    listPublicCategories(),
    listLiveSlides(),
    getCurrentCampaign(),
    getSettings(),
  ])
  res.json({
    categories,
    slides,
    campaign: campaign && publicCampaign(campaign),
    announcement: settings.announcement,
    homeSections: settings.homeSections,
  })
})

function publicCampaign(c) {
  const { name: _name, active: _active, updatedAt, ...rest } = c.toJSON()
  // The popup is shown again when the campaign is edited.
  return { ...rest, version: new Date(updatedAt).getTime() }
}
