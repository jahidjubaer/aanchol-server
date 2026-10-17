import { MOBILE_WALLETS } from '../config/shop.js'

// bKash / Nagad options that are switched on and have a number.
export const enabledWallets = (payments) => MOBILE_WALLETS.filter((w) => payments[w]?.enabled && payments[w]?.number)

// What has to be sent before an order is confirmed: the delivery charge, but at least minAdvance
// (so free delivery inside Dhaka still needs ৳120), and never more than the order itself.
export function requiredAdvance(toPay, deliveryFee, minAdvance) {
  if (toPay <= 0) return 0
  return Math.min(toPay, Math.max(deliveryFee, minAdvance))
}
