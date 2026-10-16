import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { createOrder } from '../services/orders.js'
import { HttpError } from '../utils/httpError.js'
import { validateOrderInput } from '../utils/validateOrder.js'

export const ordersRouter = Router()

// A real customer places a few orders at most; this stops scripted spam.
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many orders from this connection. Please wait a little or contact us on WhatsApp.' },
})

// POST /api/orders  { customer: {...}, delivery: 'inside-dhaka', items: [{ slug, qty }] }
ordersRouter.post('/', orderLimiter, async (req, res) => {
  const { errors, value } = validateOrderInput(req.body)
  if (Object.keys(errors).length) throw new HttpError(400, 'Please check your details.', { fields: errors })
  const order = await createOrder(value)
  res.status(201).json({ order })
})
