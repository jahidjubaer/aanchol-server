import { randomInt } from 'node:crypto'

// No 0/O or 1/I, so the number is easy to read out over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function makeOrderNumber() {
  let code = ''
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return `AN-${code}`
}
