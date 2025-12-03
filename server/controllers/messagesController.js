import Message from '../models/Message.js'
import User from '../models/User.js'
import Log from '../models/Log.js'
import SessionState from '../models/SessionState.js'
import { writeLog } from '../utils/logger.js'

function log(event, details) {
  console.log(`[messages] ${event}`, details);
  Log.create({ event, details }).catch(()=>{})
}

export async function postMessage(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId, ciphertext, iv, counter, timestamp } = req.body
    if (!sessionId || !ciphertext || !iv || typeof counter !== 'number' || !timestamp) return res.status(400).json({ error: 'Missing fields' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    // Authorization: ensure user is a participant in the session
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      // log authorization violation
      log('authorization_violation', { action: 'postMessage', sessionId, attemptedBy: user.username })
      await Log.create({ event: 'authorization_violation', details: { action: 'postMessage', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }
    // SERVER-SIDE REPLAY DETECTION
    // Track highest counter per session and reject messages with counter <= highestCounter
    if (counter <= session.highestCounter) {
      // log replay attempt
      log('replay_detected', { sessionId, sender: user.username, counter, highestSeen: session.highestCounter })
      await Log.create({ event: 'replay_detected', details: { sessionId, sender: user.username, counter, highestSeen: session.highestCounter } }).catch(()=>{})
      writeLog('detected_replay_attack', { type: 'message', sessionId, sender: user.username, counter, highestSeen: session.highestCounter })
      return res.status(409).json({ error: 'Replay detected' })
    }

    // store the encrypted message and metadata only
    await Message.create({ sessionId, senderUserId: uid, senderUsername: user.username, ciphertext, iv, counter, timestamp: new Date(timestamp) })

    // update highest counter
    session.highestCounter = counter
    session.updatedAt = new Date()
    await session.save()

    log('message_stored', { sessionId, sender: user.username, counter })
    writeLog('server_side_metadata_access', { byUserId: uid, route: 'messages/post', sessionId })
    res.json({ ok: true })
  } catch (err) {
    log('post_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function getMessages(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      log('authorization_violation', { action: 'getMessages', sessionId, attemptedBy: user.username })
      await Log.create({ event: 'authorization_violation', details: { action: 'getMessages', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Return all messages for the session
    const msgs = await Message.find({ sessionId }).sort({ createdAt: 1 }).select('-__v')
    log('messages_fetch', { sessionId, by: uid, count: msgs.length })
    writeLog('server_side_metadata_access', { byUserId: uid, route: 'messages/get', sessionId, count: msgs.length })
    res.json({ messages: msgs })
  } catch (err) {
    log('get_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}
