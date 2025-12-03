import mongoose from 'mongoose'

const publicKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  username: { type: String, required: true, trim: true },
  public: {
    ecdh: { type: Object, required: true },
    ecdsa: { type: Object, required: true }
  }
}, { timestamps: true })

const PublicKey = mongoose.model('PublicKey', publicKeySchema)
export default PublicKey
