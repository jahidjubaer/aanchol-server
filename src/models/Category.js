import mongoose from 'mongoose'
import { CATEGORY_STATUSES, CATEGORY_TEMPLATES } from '../config/shop.js'

// A product line: Tangail Jamdani, Handmade Jewellery, later Muslin, Manipuri...
// The slug is fixed once created, because products and links point at it.
const categorySchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]+$/ },
    name: { type: String, required: true, trim: true },
    nameBangla: { type: String, trim: true },
    intro: String,
    banner: String,
    status: { type: String, enum: CATEGORY_STATUSES, default: 'live' },
    inNav: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    template: { type: String, enum: CATEGORY_TEMPLATES, default: 'general' },
    // Filter chips inside the category page, e.g. Wood, Carved, Handmade.
    types: { type: [{ slug: String, label: String, _id: false }], default: [] },
  },
  { timestamps: true },
)

categorySchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret._id
    delete ret.createdAt
    delete ret.updatedAt
    return ret
  },
})

export const Category = mongoose.model('Category', categorySchema)
