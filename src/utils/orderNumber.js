import { randomInt } from 'node:crypto'

// No 0/O or 1/I, so the number is easy to read out over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function makeOrderNumber() {
  let code = ''
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return `AN-${code}`
}

function randomCode(length) {
  let code = ''
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

// GC-XXXXXX: the reference for a gift card purchase, safe to share.
export const makeGiftReference = () => `GC-${randomCode(6)}`

// GIFT-XXXX-XXXX: the code that spends the card. 8 characters from 32 is about a trillion
// possibilities, and checking codes is rate limited.
export const makeGiftCode = () => `GIFT-${randomCode(4)}-${randomCode(4)}`
