import mongoose from 'mongoose'
import { GIFT_CARD_PAYMENTS } from '../config/shop.js'

const useSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    amount: Number,
    at: { type: Date, default: Date.now },
    refunded: Boolean, // the order was cancelled and the amount went back on the card
  },
  { _id: false },
)

// A gift card. Ordered online (status pending) and activated by the admin once paid, which gives it
// its code. The admin can also make one directly, e.g. for a card sold in person.
const giftCardSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true }, // GC-XXXXXX, for talking about the purchase
    code: { type: String, unique: true, sparse: true }, // GIFT-XXXX-XXXX, only once active
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'active', 'cancelled'], default: 'pending', index: true },
    buyer: { name: String, phone: String },
    recipient: { name: String, phone: String },
    message: String,
    payment: {
      method: { type: String, enum: GIFT_CARD_PAYMENTS },
      paid: { type: Boolean, default: false },
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    createdBy: String, // 'customer', or the admin's email
    adminNote: String,
    activatedAt: Date,
    expiresAt: Date,
    uses: { type: [useSchema], default: [] },
    sample: { type: Boolean, default: undefined },
  },
  { timestamps: true },
)

giftCardSchema.index({ createdAt: -1 })

export const GiftCard = mongoose.model('GiftCard', giftCardSchema)
