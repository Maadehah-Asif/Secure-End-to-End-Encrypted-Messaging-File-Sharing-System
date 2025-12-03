import mongoose from 'mongoose'

const sessionMessageSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['SESSION_INIT','SESSION_REPLY'], required: true },
  payload: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  consumed: { type: Boolean, default: false }
}, { timestamps: true })

const SessionMessage = mongoose.model('SessionMessage', sessionMessageSchema)
export default SessionMessage
