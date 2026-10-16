// Settings come from environment variables (.env locally, the Render dashboard in production).
function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  isProduction: process.env.NODE_ENV === 'production',
  // Comma-separated list, e.g. "http://localhost:5173,https://aanchol.com"
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
  mongoUri: () => required('MONGODB_URI'),
  jwtSecret: () => {
    const secret = required('JWT_SECRET')
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long.')
    return secret
  },
  // Photo uploads. Optional: without these the admin works, but can't upload photos.
  cloudinary: () => {
    const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env
    if (!cloudName || !apiKey || !apiSecret) return null
    return {
      cloudName,
      apiKey,
      apiSecret,
      folder: process.env.CLOUDINARY_FOLDER || 'aanchol/products',
      // CLOUDINARY_UPLOAD_URL is only for local testing against a stand-in upload server.
      uploadUrl: process.env.CLOUDINARY_UPLOAD_URL || `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    }
  },
}
