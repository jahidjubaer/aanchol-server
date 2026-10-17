import { Router } from 'express'
import { countPaymentsToCheck } from '../services/adminOrders.js'
import { getCustomerById } from '../services/customers.js'
import {
  cancelGiftCard,
  countPendingGiftCards,
  createGiftCardAsAdmin,
  getGiftCard,
  listGiftCards,
  markGiftCardPaid,
  setGiftCardNote,
  toAdminGiftCardJSON,
} from '../services/giftCards.js'
import { getMembership } from '../services/membership.js'
import { closeStockAlert, countReadyAlerts, listStockAlerts } from '../services/stockAlerts.js'

// Mounted under /api/admin, after requireAdmin. Gift cards, restock requests, membership.
// Membership levels and gift wrap are saved through PATCH /api/admin/settings.
export const adminRewardsRouter = Router()

// GET /api/admin/gift-cards?status=pending&q=GC-7KQ&page=1
adminRewardsRouter.get('/gift-cards', async (req, res) => {
  res.json(await listGiftCards(req.query))
})
adminRewardsRouter.get('/gift-cards/:id', async (req, res) => {
  res.json({ giftCard: toAdminGiftCardJSON(await getGiftCard(req.params.id)) })
})
// A card sold in person: made active straight away.
adminRewardsRouter.post('/gift-cards', async (req, res) => {
  res.status(201).json({ giftCard: toAdminGiftCardJSON(await createGiftCardAsAdmin(req.body, req.admin)) })
})
// Payment received for an online request: the card gets its code.
adminRewardsRouter.post('/gift-cards/:id/activate', async (req, res) => {
  res.json({ giftCard: toAdminGiftCardJSON(await markGiftCardPaid(await getGiftCard(req.params.id))) })
})
adminRewardsRouter.post('/gift-cards/:id/cancel', async (req, res) => {
  res.json({ giftCard: toAdminGiftCardJSON(await cancelGiftCard(await getGiftCard(req.params.id))) })
})
adminRewardsRouter.patch('/gift-cards/:id', async (req, res) => {
  res.json({ giftCard: toAdminGiftCardJSON(await setGiftCardNote(await getGiftCard(req.params.id), req.body?.adminNote)) })
})

// Restock requests, grouped by piece
adminRewardsRouter.get('/stock-alerts', async (_req, res) => {
  res.json({ groups: await listStockAlerts() })
})
// Marks one person as told (after the WhatsApp message).
adminRewardsRouter.post('/stock-alerts/:id/done', async (req, res) => {
  await closeStockAlert(req.params.id)
  res.status(204).end()
})

// Numbers for the admin tabs: payments to check, gift cards waiting for payment, people to tell about restocks.
adminRewardsRouter.get('/badges', async (_req, res) => {
  const [giftCards, restock, payments] = await Promise.all([countPendingGiftCards(), countReadyAlerts(), countPaymentsToCheck()])
  res.json({ giftCards, restock, payments })
})

adminRewardsRouter.get('/customers/:id/membership', async (req, res) => {
  res.json({ membership: await getMembership(await getCustomerById(req.params.id)) })
})
