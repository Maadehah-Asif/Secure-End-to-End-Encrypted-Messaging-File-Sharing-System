import mongoose from 'mongoose'

const logSchema = new mongoose.Schema({
  level: { type: String, default: 'info' },
  event: { type: String },
  details: { type: Object },
  createdAt: { type: Date, default: Date.now }
})

const Log = mongoose.model('Log', logSchema)
export default Log
