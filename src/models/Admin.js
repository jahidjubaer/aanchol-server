import mongoose from 'mongoose'

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
)

adminSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => ({ email: ret.email, name: ret.name }),
})

export const Admin = mongoose.model('Admin', adminSchema)
