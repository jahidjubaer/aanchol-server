import mongoose from 'mongoose'

// One document holding shop-wide settings the admin can change.
const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    announcement: { type: [String], default: [] },
    homeSections: { type: [{ id: String, visible: Boolean, _id: false }], default: [] },
    // Unset until the admin changes them; the defaults in config/shop.js apply meanwhile.
    memberTiers: { type: [{ name: String, min: Number, percent: Number, _id: false }], default: undefined },
    giftWrap: { enabled: Boolean, fee: Number },
    payments: {
      bkash: { enabled: Boolean, number: String },
      nagad: { enabled: Boolean, number: String },
      minAdvance: Number,
    },
    // Set while sample data is loaded, so removing it can undo what it changed.
    sampleState: { jewelleryStatus: String },
  },
  { timestamps: true },
)

siteSettingsSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => ({ announcement: ret.announcement, homeSections: ret.homeSections, updatedAt: ret.updatedAt }),
})

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema)
