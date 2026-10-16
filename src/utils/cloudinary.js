import { createHash } from 'node:crypto'

// Cloudinary's signed-upload rule: sort the parameters, join as a=1&b=2, append the API secret, SHA-1.
// https://cloudinary.com/documentation/authentication_signatures
export function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(toSign + apiSecret).digest('hex')
}

// What the browser needs to upload one photo straight to Cloudinary.
// The secret never leaves the server; the signature is only valid for these exact parameters for one hour.
export function createUploadSignature(config, now = Date.now()) {
  const params = { folder: config.folder, timestamp: Math.floor(now / 1000) }
  return {
    uploadUrl: config.uploadUrl,
    fields: { ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) },
  }
}

export const isCloudinaryUrl = (url) => /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\//.test(url)
