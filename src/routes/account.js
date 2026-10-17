import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { requireCustomer, signCustomerToken } from '../middleware/customerAuth.js'
import {
  addAddress,
  changePassword,
  claimOrder,
  getCustomerOrder,
  listCustomerOrders,
  login,
  mergeWishlist,
  register,
  removeAddress,
  resetPassword,
  setWishlist,
  updateAddress,
  updateProfile,
} from '../services/customers.js'

export const accountRouter = Router()

const limiter = (limit, windowMinutes, message, extra = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: message },
    ...extra,
  })

// Only failed sign-ins count, so the right password is never blocked.
const loginLimiter = limiter(10, 15, 'Too many sign-in attempts. Please wait 15 minutes and try again.', { skipSuccessfulRequests: true })
const registerLimiter = limiter(10, 60, 'Too many new accounts from this connection. Please try again later.')
const resetLimiter = limiter(10, 15, 'Too many attempts. Please wait a little and try again.')

const session = (customer) => ({ token: signCustomerToken(customer), customer })

// POST /api/account/register  { name, phone, password }
accountRouter.post('/register', registerLimiter, async (req, res) => {
  res.status(201).json(session(await register(req.body ?? {})))
})

// POST /api/account/login  { phone, password }
accountRouter.post('/login', loginLimiter, async (req, res) => {
  res.json(session(await login(req.body ?? {})))
})

// POST /api/account/reset  { token, password }  — the link comes from the admin, via WhatsApp
accountRouter.post('/reset', resetLimiter, async (req, res) => {
  res.json(session(await resetPassword(req.body ?? {})))
})

accountRouter.use(requireCustomer)

accountRouter.get('/me', (req, res) => {
  res.json({ customer: req.customer, wishlist: req.customer.wishlist })
})

accountRouter.patch('/me', async (req, res) => {
  res.json({ customer: await updateProfile(req.customer, req.body) })
})

// POST /api/account/password  { current, password }  → a fresh login; other devices are signed out
accountRouter.post('/password', async (req, res) => {
  res.json(session(await changePassword(req.customer, req.body ?? {})))
})

accountRouter.post('/addresses', async (req, res) => {
  res.status(201).json({ customer: await addAddress(req.customer, req.body) })
})
accountRouter.patch('/addresses/:id', async (req, res) => {
  res.json({ customer: await updateAddress(req.customer, req.params.id, req.body) })
})
accountRouter.delete('/addresses/:id', async (req, res) => {
  res.json({ customer: await removeAddress(req.customer, req.params.id) })
})

// PUT replaces the list; POST /merge adds what was saved on this device before signing in.
accountRouter.put('/wishlist', async (req, res) => {
  res.json({ wishlist: await setWishlist(req.customer, req.body?.wishlist) })
})
accountRouter.post('/wishlist/merge', async (req, res) => {
  res.json({ wishlist: await mergeWishlist(req.customer, req.body?.wishlist) })
})

accountRouter.get('/orders', async (req, res) => {
  res.json({ orders: await listCustomerOrders(req.customer) })
})
accountRouter.get('/orders/:orderNumber', async (req, res) => {
  res.json({ order: await getCustomerOrder(req.customer, req.params.orderNumber) })
})
// POST /api/account/orders/claim  { orderNumber }  — adds an order placed as a guest with this phone
accountRouter.post('/orders/claim', async (req, res) => {
  res.json({ order: await claimOrder(req.customer, req.body?.orderNumber) })
})
