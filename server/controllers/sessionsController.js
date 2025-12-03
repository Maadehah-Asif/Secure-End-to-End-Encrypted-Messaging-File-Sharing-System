import SessionMessage from '../models/SessionMessage.js'
import User from '../models/User.js'
import SessionState from '../models/SessionState.js'
import Log from '../models/Log.js'
import { writeLog } from '../utils/logger.js'

function log(event, details) {
  console.log(`[sessions] ${event}`, details);
}

export async function postSessionInit(req, res) {
  try {
    const from = req.user?.uid
    if (!from) return res.status(401).json({ error: 'Unauthorized' })
    const { toUsername, payload } = req.body
    if (!toUsername || !payload) return res.status(400).json({ error: 'Missing fields' })
    const toUser = await User.findOne({ username: toUsername })
    if (!toUser) return res.status(404).json({ error: 'Recipient not found' })

    const msg = await SessionMessage.create({ fromUserId: from, toUserId: toUser._id, type: 'SESSION_INIT', payload })
    // create session metadata using the init message id as the canonical sessionId
    try {
      const initiatorUser = await User.findById(from)
      await SessionState.create({ sessionId: msg._id.toString(), initiatorUsername: initiatorUser?.username || null })
    } catch (e) {
      // ignore create errors (unique constraint etc) but log
      Log.create({ event: 'session_state_create_error', details: { message: e.message, initId: msg._id.toString() } }).catch(()=>{})
    }

    log('init_sent', { from, to: toUser._id })
    writeLog('key_exchange_attempt', { type: 'SESSION_INIT', fromUserId: from, toUserId: toUser._id })
    res.json({ ok: true, id: msg._id })
  } catch (err) {
    log('init_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function postSessionReply(req, res) {
  try {
    const from = req.user?.uid
    if (!from) return res.status(401).json({ error: 'Unauthorized' })
    const { toUsername, payload } = req.body
    if (!toUsername || !payload) return res.status(400).json({ error: 'Missing fields' })
    const toUser = await User.findOne({ username: toUsername })
    if (!toUser) return res.status(404).json({ error: 'Recipient not found' })

    const msg = await SessionMessage.create({ fromUserId: from, toUserId: toUser._id, type: 'SESSION_REPLY', payload })
    // payload should include inReplyTo referencing the init message id; set responderUsername on that session
    try {
      const inReplyTo = payload && payload.inReplyTo
      if (inReplyTo) {
        const responderUser = await User.findById(from)
        const sess = await SessionState.findOne({ sessionId: inReplyTo.toString() })
        if (sess) {
          sess.responderUsername = responderUser?.username || null
          sess.updatedAt = new Date()
          await sess.save()
        } else {
          // create with both if missing
          await SessionState.create({ sessionId: inReplyTo.toString(), responderUsername: responderUser?.username || null })
        }
      }
    } catch (e) {
      Log.create({ event: 'session_state_reply_error', details: { message: e.message, replyId: msg._id.toString() } }).catch(()=>{})
    }

    log('reply_sent', { from, to: toUser._id })
    writeLog('key_exchange_attempt', { type: 'SESSION_REPLY', fromUserId: from, toUserId: toUser._id })
    res.json({ ok: true, id: msg._id })
  } catch (err) {
    log('reply_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function fetchMessages(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const msgs = await SessionMessage.find({ toUserId: uid, consumed: false }).sort({ createdAt: 1 })
    // return messages but don't mark consumed — let client delete after processing
    writeLog('server_side_metadata_access', { byUserId: uid, count: msgs.length, route: 'sessions/inbox' })
    res.json({ messages: msgs })
  } catch (err) {
    log('fetch_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function consumeMessage(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const id = req.params.id
    const doc = await SessionMessage.findOne({ _id: id, toUserId: uid })
    if (!doc) return res.status(404).json({ error: 'Not found' })
    doc.consumed = true
    await doc.save()
    writeLog('server_side_metadata_access', { byUserId: uid, route: 'sessions/consume', messageId: id })
    res.json({ ok: true })
  } catch (err) {
    log('consume_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

// Expose session state for authorized participants (includes highest counters)
export async function getSessionState(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const sess = await SessionState.findOne({ sessionId })
    if (!sess) return res.status(404).json({ error: 'Session not found' })
    if (!((sess.initiatorUsername === user.username) || (sess.responderUsername === user.username))) {
      Log.create({ event: 'authorization_violation', details: { action: 'getSessionState', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }
    res.json({ sessionId: sess.sessionId, initiatorUsername: sess.initiatorUsername, responderUsername: sess.responderUsername, highestCounter: sess.highestCounter || 0, highestFileCounter: sess.highestFileCounter || 0 })
  } catch (err) {
    log('state_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}
