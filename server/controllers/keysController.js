import PublicKey from '../models/PublicKey.js'
import User from '../models/User.js'

function log(event, details) {
  console.log(`[keys] ${event}`, details);
}

export async function upsertPublicKeys(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { ecdh, ecdsa } = req.body
    if (!ecdh || !ecdsa) return res.status(400).json({ error: 'Missing key material' })
    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const doc = await PublicKey.findOneAndUpdate(
      { userId: uid },
      { userId: uid, username: user.username, public: { ecdh, ecdsa } },
      { upsert: true, new: true }
    )
    log('upload', { userId: uid, username: user.username })
    res.json({ ok: true, public: doc.public })
  } catch (err) {
    log('upload_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function getPublicKeys(req, res) {
  try {
    const username = req.params.username
    if (!username) return res.status(400).json({ error: 'username required' })
    const doc = await PublicKey.findOne({ username }).select('public username')
    log('fetch', { by: req.user?.uid || 'anon', username })
    if (!doc) return res.status(404).json({ error: 'Public keys not found' })
    res.json({ username: doc.username, public: doc.public })
  } catch (err) {
    log('fetch_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}
