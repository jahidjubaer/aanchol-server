import mongoose from 'mongoose'

const addressSchema = new mongoose.Schema(
  {
    label: String, // e.g. Home, Office
    name: String,
    phone: String,
    city: String,
    address: String,
  },
  { _id: true },
)

// A shopper's account. Signs in with phone + password; the number isn't verified by SMS yet.
const customerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true }, // 01XXXXXXXXX
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    addresses: { type: [addressSchema], default: [] },
    defaultAddress: mongoose.Schema.Types.ObjectId,
    wishlist: { type: [String], default: [] }, // product slugs, newest first
    active: { type: Boolean, default: true }, // false = blocked by the admin
    // Raised on password change, reset or block, so every older login stops working.
    tokenVersion: { type: Number, default: 0 },
    resetTokenHash: String,
    resetExpires: Date,
    lastLoginAt: Date,
    // Given the first time the customer reaches a membership level; shown on their card.
    memberNo: { type: String, unique: true, sparse: true },
    memberSince: Date,
    sample: { type: Boolean, default: undefined }, // demo data, removed with npm run sample:remove
  },
  { timestamps: true },
)

customerSchema.index({ createdAt: -1 })

customerSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => ({
    name: ret.name,
    phone: ret.phone,
    email: ret.email ?? '',
    addresses: (ret.addresses ?? []).map(({ _id, ...a }) => ({ id: String(_id), ...a })),
    defaultAddress: ret.defaultAddress ? String(ret.defaultAddress) : null,
    createdAt: ret.createdAt,
  }),
})

export const Customer = mongoose.model('Customer', customerSchema)
