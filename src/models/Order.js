import mongoose from 'mongoose'
import { ORDER_STATUSES, PAYMENT_METHODS } from '../config/shop.js'

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // price paid per piece at the time of the order
    listPrice: Number, // the full price, when a campaign discount was applied
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const statusChangeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: String, // admin email, or 'customer' when the order is placed
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    campaign: { name: String, title: String, percentOff: Number }, // the sale applied, if any
    delivery: {
      id: { type: String, required: true },
      label: String,
      eta: String,
      fee: { type: Number, required: true },
    },
    total: { type: Number, required: true },
    payment: {
      method: { type: String, enum: PAYMENT_METHODS, default: 'cod' },
      paid: { type: Boolean, default: false },
    },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true, index: true },
      email: String,
      city: { type: String, required: true },
      address: { type: String, required: true },
      note: String,
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'pending', index: true },
    statusHistory: { type: [statusChangeSchema], default: () => [{ status: 'pending', by: 'customer' }] },
    adminNote: { type: String, maxlength: 1000 }, // only visible in the admin
    // The account it belongs to: placed while signed in, or claimed later with order number + phone.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true },
    sample: { type: Boolean, default: undefined }, // demo data, removed with npm run sample:remove
  },
  { timestamps: true },
)

orderSchema.index({ createdAt: -1 })

// Public shape. The admin routes add adminNote and statusHistory themselves.
orderSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret.orderNumber
    delete ret._id
    delete ret.orderNumber
    delete ret.adminNote
    delete ret.statusHistory
    delete ret.customerId
    delete ret.sample
    ret.items = ret.items.map(({ product: _product, ...item }) => item)
    return ret
  },
})

export const Order = mongoose.model('Order', orderSchema)
