import User from '../models/User.js'
import PublicKey from '../models/PublicKey.js'
import Log from '../models/Log.js'

export async function listUsers(req, res) {
  try {
    if (!req.user || !req.user.uid) return res.status(401).json({ error: 'Unauthorized' })

    // fetch users excluding requester
    const users = await User.find({ _id: { $ne: req.user.uid } }).select('username fullName').lean()

    const usernames = users.map(u => u.username)
    const keys = await PublicKey.find({ username: { $in: usernames } }).select('username').lean()
    const keySet = new Set((keys || []).map(k => k.username))

    const out = users.map(u => ({ username: u.username, fullName: u.fullName, publicKeysAvailable: keySet.has(u.username) }))

    // log event
    try { await Log.create({ event: 'contact_list_viewed', details: { by: req.user.uid } }) } catch (e) { console.error('[log_error]', e.message) }

    res.json({ users: out })
  } catch (err) {
    console.error('[users_list_error]', err.message)
    res.status(500).json({ error: 'Server error' })
  }
}
