import { HttpError } from '../utils/httpError.js'

export function notFound(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.path}`))
}

// Every error leaves as { error, ...details }. Unexpected ones are logged and kept vague.
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON body.')
  if (err.type === 'entity.too.large') err = new HttpError(413, 'Request body is too large.')

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.details })
  }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
}
