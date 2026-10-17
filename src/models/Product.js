import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    name: { type: String, required: true, trim: true },
    nameBangla: { type: String, trim: true },
    category: { type: String, required: true, index: true },
    type: { type: String }, // one of the category's types, e.g. "wood"
    origin: String,
    fabric: String,
    count: Number,
    color: String,
    price: { type: Number, required: true, min: 0 },
    compareAt: { type: Number, min: 0 },
    badge: String,
    images: { type: [String], default: [] },
    colors: { base: String, motif: String },
    details: { type: [{ label: String, value: String, _id: false }], default: undefined },
    description: String,
    weavingTime: String,
    weaver: String,
    stock: { type: Number, required: true, min: 0, default: 0 },
    addedOn: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// The public shape sent to the shop, without internal fields.
productSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    delete ret.active
    delete ret.createdAt
    delete ret.updatedAt
    ret.addedOn = ret.addedOn?.toISOString().slice(0, 10)
    return ret
  },
})

export const Product = mongoose.model('Product', productSchema)
