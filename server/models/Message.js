import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderUsername: { type: String, required: true },
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  counter: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true })

const Message = mongoose.model('Message', messageSchema)
export default Message
