import mongoose from 'mongoose'
import { ORDER_STATUSES, PAYMENT_METHODS } from '../config/shop.js'

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    slug: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // price at the time of the order
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false },
)

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
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
  },
  { timestamps: true },
)

orderSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret.orderNumber
    delete ret._id
    delete ret.orderNumber
    ret.items = ret.items.map(({ product: _product, ...item }) => item)
    return ret
  },
})

export const Order = mongoose.model('Order', orderSchema)
