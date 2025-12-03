import mongoose from 'mongoose'

const sessionStateSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  initiatorUsername: { type: String, required: false },
  responderUsername: { type: String, required: false },
  highestCounter: { type: Number, default: 0 },
  highestFileCounter: { type: Number, default: 0 },
  confirmedAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

const SessionState = mongoose.model('SessionState', sessionStateSchema)
export default SessionState
