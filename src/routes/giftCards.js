import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { optionalCustomer } from '../middleware/customerAuth.js'
import { checkGiftCard, requestGiftCard, toGiftCardJSON } from '../services/giftCards.js'

export const giftCardsRouter = Router()

const limiter = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: message },
  })

// POST /api/gift-cards  { amount, buyerName, buyerPhone, recipientName, recipientPhone?, message?, paymentMethod }
// The card waits for payment; the admin activates it and sends the code on WhatsApp.
giftCardsRouter.post('/', limiter(10, 'Too many requests. Please wait a little or contact us on WhatsApp.'), optionalCustomer, async (req, res) => {
  const card = await requestGiftCard(req.body ?? {}, req.customer)
  res.status(201).json({ giftCard: toGiftCardJSON(card) })
})

// POST /api/gift-cards/check  { code }  →  { code, balance, expiresAt }
// Limited, so codes can't be guessed by trying many.
giftCardsRouter.post('/check', limiter(15, 'Too many tries. Please wait 15 minutes.'), async (req, res) => {
  res.json({ giftCard: await checkGiftCard(req.body?.code) })
})
