import mongoose from 'mongoose'

mongoose.set('strictQuery', true)

export async function connectDb(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  console.log(`MongoDB connected: ${mongoose.connection.name}`)
}

export function disconnectDb() {
  return mongoose.disconnect()
}
