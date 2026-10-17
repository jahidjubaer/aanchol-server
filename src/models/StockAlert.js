import mongoose from 'mongoose'

// "Tell me when it's back": a phone number waiting for a sold-out piece.
// The admin sends the WhatsApp message and marks it notified.
const stockAlertSchema = new mongoose.Schema(
  {
    product: { type: String, required: true }, // slug
    phone: { type: String, required: true },
    name: String,
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    open: { type: Boolean, default: true }, // false once notified
    notifiedAt: Date,
    sample: { type: Boolean, default: undefined },
  },
  { timestamps: true },
)

// One open request per number and piece; asking twice just keeps the first.
stockAlertSchema.index({ product: 1, phone: 1 }, { unique: true, partialFilterExpression: { open: true } })
stockAlertSchema.index({ open: 1, createdAt: -1 })

export const StockAlert = mongoose.model('StockAlert', stockAlertSchema)
