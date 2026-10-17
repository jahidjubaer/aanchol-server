import { Router } from 'express'
import { HOME_SECTIONS } from '../config/shop.js'
import { createCampaign, deleteCampaign, getCampaign, listCampaigns, updateCampaign } from '../services/campaigns.js'
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from '../services/categories.js'
import { getSettings, updateSettings } from '../services/siteSettings.js'
import { createSlide, deleteSlide, getSlide, listSlides, updateSlide } from '../services/slides.js'

// Mounted under /api/admin, after requireAdmin. Everything the shop shows besides products and orders.
export const adminContentRouter = Router()

// Categories, by slug
adminContentRouter.get('/categories', async (_req, res) => {
  res.json({ categories: await listCategories() })
})
adminContentRouter.get('/categories/:slug', async (req, res) => {
  res.json({ category: await getCategory(req.params.slug) })
})
adminContentRouter.post('/categories', async (req, res) => {
  res.status(201).json({ category: await createCategory(req.body) })
})
adminContentRouter.patch('/categories/:slug', async (req, res) => {
  res.json({ category: await updateCategory(req.params.slug, req.body) })
})
adminContentRouter.delete('/categories/:slug', async (req, res) => {
  await deleteCategory(req.params.slug)
  res.status(204).end()
})

// Hero slides, by id
adminContentRouter.get('/slides', async (_req, res) => {
  res.json({ slides: await listSlides() })
})
adminContentRouter.get('/slides/:id', async (req, res) => {
  res.json({ slide: await getSlide(req.params.id) })
})
adminContentRouter.post('/slides', async (req, res) => {
  res.status(201).json({ slide: await createSlide(req.body) })
})
adminContentRouter.patch('/slides/:id', async (req, res) => {
  res.json({ slide: await updateSlide(req.params.id, req.body) })
})
adminContentRouter.delete('/slides/:id', async (req, res) => {
  await deleteSlide(req.params.id)
  res.status(204).end()
})

// Campaigns, by id
adminContentRouter.get('/campaigns', async (_req, res) => {
  res.json({ campaigns: await listCampaigns() })
})
adminContentRouter.get('/campaigns/:id', async (req, res) => {
  res.json({ campaign: await getCampaign(req.params.id) })
})
adminContentRouter.post('/campaigns', async (req, res) => {
  res.status(201).json({ campaign: await createCampaign(req.body) })
})
adminContentRouter.patch('/campaigns/:id', async (req, res) => {
  res.json({ campaign: await updateCampaign(req.params.id, req.body) })
})
adminContentRouter.delete('/campaigns/:id', async (req, res) => {
  await deleteCampaign(req.params.id)
  res.status(204).end()
})

// Announcement bar and home page layout
adminContentRouter.get('/settings', async (_req, res) => {
  res.json({ settings: await getSettings(), sections: HOME_SECTIONS })
})
adminContentRouter.patch('/settings', async (req, res) => {
  res.json({ settings: await updateSettings(req.body), sections: HOME_SECTIONS })
})
