import mongoose from 'mongoose'

const fileChunkSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderUsername: { type: String, required: true },
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  counter: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true })

fileChunkSchema.index({ sessionId: 1, filename: 1, chunkIndex: 1 }, { unique: true })

const FileChunk = mongoose.model('FileChunk', fileChunkSchema)
export default FileChunk
