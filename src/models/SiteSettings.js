import mongoose from 'mongoose'

// One document holding shop-wide settings the admin can change.
const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    announcement: { type: [String], default: [] },
    homeSections: { type: [{ id: String, visible: Boolean, _id: false }], default: [] },
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
