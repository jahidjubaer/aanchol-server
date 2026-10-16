import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireAdmin, signAdminToken } from '../middleware/auth.js'
import { Admin } from '../models/Admin.js'
import { getOrder, listOrders, toAdminJSON, updateOrder } from '../services/adminOrders.js'
import { HttpError } from '../utils/httpError.js'
import { verifyPassword } from '../utils/password.js'

export const adminRouter = Router()

// Only failed attempts count, so a correct login is never blocked.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
})

// Compared against when the email doesn't exist, so both cases take the same time.
const DUMMY_HASH = '00000000000000000000000000000000:' + '0'.repeat(128)

// POST /api/admin/login  { email, password }
adminRouter.post('/login', loginLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) throw new HttpError(400, 'Please enter your email and password.')

  const admin = await Admin.findOne({ email, active: true })
  const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH)
  if (!admin || !ok) throw new HttpError(401, 'Email or password is incorrect.')

  admin.lastLoginAt = new Date()
  await admin.save()
  res.json({ token: signAdminToken(admin), admin })
})

adminRouter.use(requireAdmin)

adminRouter.get('/me', (req, res) => {
  res.json({ admin: req.admin })
})

// GET /api/admin/orders?status=pending&q=AN-7KQ&page=1
adminRouter.get('/orders', async (req, res) => {
  const { status, q, page } = req.query
  res.json(await listOrders({ status, q, page }))
})

adminRouter.get('/orders/:orderNumber', async (req, res) => {
  res.json({ order: toAdminJSON(await getOrder(req.params.orderNumber)) })
})

// PATCH /api/admin/orders/AN-7KQ2MX  { status?: 'confirmed', adminNote?: '...' }
adminRouter.patch('/orders/:orderNumber', async (req, res) => {
  const { status, adminNote } = req.body ?? {}
  const order = await updateOrder(req.params.orderNumber, { status, adminNote }, req.admin)
  res.json({ order: toAdminJSON(order) })
})
