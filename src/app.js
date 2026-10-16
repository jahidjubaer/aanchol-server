import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/errors.js'
import { ordersRouter } from './routes/orders.js'
import { productsRouter } from './routes/products.js'

export function createApp() {
  const app = express()

  app.set('trust proxy', 1) // Render sits in front of the app; needed for correct client IPs in rate limiting
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: env.clientOrigins }))
  app.use(express.json({ limit: '20kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
  })
  app.use('/api/products', productsRouter)
  app.use('/api/orders', ordersRouter)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
