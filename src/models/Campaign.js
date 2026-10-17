import mongoose from 'mongoose'

// A sale like "Eid: 10% off". Between its dates, prices drop automatically and the
// home page shows a popup. percentOff 0 makes it an announcement only.
const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // for the admin list, e.g. "Eid ul-Adha 2026"
    title: { type: String, required: true },
    titleBangla: String,
    message: String,
    image: String,
    ctaLabel: String,
    ctaLink: String,
    percentOff: { type: Number, min: 0, max: 90, default: 0 },
    categories: { type: [String], default: [] }, // empty = every category
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    popup: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    sample: { type: Boolean, default: undefined }, // demo data, removed with npm run sample:remove
  },
  { timestamps: true },
)

campaignSchema.index({ active: 1, startsAt: 1, endsAt: 1 })

campaignSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = doc._id.toString()
    delete ret._id
    delete ret.createdAt
    if (!ret.sample) delete ret.sample
    return ret
  },
})

export const Campaign = mongoose.model('Campaign', campaignSchema)
