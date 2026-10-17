import { Router } from 'express'
import { Order } from '../models/Order.js'
import { toAdminJSON } from '../services/adminOrders.js'
import { createResetToken, getCustomerById, listCustomers, setCustomerActive, toAdminCustomerJSON } from '../services/customers.js'

// Mounted under /api/admin, after requireAdmin.
export const adminCustomersRouter = Router()

// GET /api/admin/customers?q=0171&page=1
adminCustomersRouter.get('/customers', async (req, res) => {
  res.json(await listCustomers(req.query))
})

adminCustomersRouter.get('/customers/:id', async (req, res) => {
  const customer = await getCustomerById(req.params.id)
  const orders = await Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(50)
  res.json({ customer: toAdminCustomerJSON(customer), orders: orders.map(toAdminJSON) })
})

// PATCH { active: false } pauses the account and signs it out everywhere.
adminCustomersRouter.patch('/customers/:id', async (req, res) => {
  const customer = await setCustomerActive(await getCustomerById(req.params.id), req.body?.active)
  res.json({ customer: toAdminCustomerJSON(customer) })
})

// A one-time password reset token, valid 24 hours. The admin page turns it into a link to send on WhatsApp.
adminCustomersRouter.post('/customers/:id/reset-link', async (req, res) => {
  res.json(await createResetToken(await getCustomerById(req.params.id)))
})
