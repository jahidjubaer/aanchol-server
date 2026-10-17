import mongoose from 'mongoose'

// One slide of the home page hero. Shown while active and inside its optional dates.
const heroSlideSchema = new mongoose.Schema(
  {
    image: { type: String, required: true },
    mobileImage: String, // a taller crop for phones; the main image is used when empty
    imageAlt: String,
    eyebrow: String,
    title: { type: String, required: true },
    titleAccent: String, // second line, shown in italics
    bangla: String,
    text: String,
    ctaLabel: String,
    ctaLink: String,
    cta2Label: String,
    cta2Link: String,
    overlay: { type: Number, min: 0, max: 90, default: 45 }, // how dark the shade over the photo is, in %
    align: { type: String, enum: ['left', 'center'], default: 'left' },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    startsAt: Date,
    endsAt: Date,
  },
  { timestamps: true },
)

heroSlideSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = doc._id.toString()
    delete ret._id
    delete ret.createdAt
    return ret
  },
})

export const HeroSlide = mongoose.model('HeroSlide', heroSlideSchema)
