import FileChunk from '../models/FileChunk.js'
import User from '../models/User.js'
import Log from '../models/Log.js'
import SessionState from '../models/SessionState.js'

function log(event, details) {
  console.log(`[files] ${event}`, details);
  Log.create({ event, details }).catch(()=>{})
}

export async function postFileChunk(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId, filename, chunkIndex, ciphertext, iv, counter, timestamp } = req.body
    if (!sessionId || !filename || typeof chunkIndex !== 'number' || !ciphertext || !iv || typeof counter !== 'number' || !timestamp) return res.status(400).json({ error: 'Missing fields' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    // Authorization: ensure user is a participant in the session
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      log('authorization_violation', { action: 'postFileChunk', sessionId, attemptedBy: user.username })
      await Log.create({ event: 'authorization_violation', details: { action: 'postFileChunk', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }

    // server-side replay detection for file chunks
    // session should exist with participant info (created during session init/reply)
    if (!session) {
      // shouldn't happen due to check above, but guard anyway
      return res.status(404).json({ error: 'Session not found' })
    }
    if (counter <= (session.highestFileCounter || 0)) {
      log('file_replay_detected', { sessionId, sender: user.username, counter, highestSeen: session.highestFileCounter })
      await Log.create({ event: 'file_replay_detected', details: { sessionId, sender: user.username, counter, highestSeen: session.highestFileCounter } }).catch(()=>{})
      return res.status(409).json({ error: 'Replay detected' })
    }

    // store the file chunk
    await FileChunk.create({ sessionId, filename, chunkIndex, senderUserId: uid, senderUsername: user.username, ciphertext, iv, counter, timestamp: new Date(timestamp) })

    // update highest file counter
    session.highestFileCounter = Math.max(session.highestFileCounter || 0, counter)
    session.updatedAt = new Date()
    await session.save()

    log('file_chunk_stored', { sessionId, filename, chunkIndex, sender: user.username, counter })
    res.json({ ok: true })
  } catch (err) {
    log('post_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}

export async function getFileChunks(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId } = req.params
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      log('authorization_violation', { action: 'getFileChunks', sessionId, attemptedBy: user.username })
      await Log.create({ event: 'authorization_violation', details: { action: 'getFileChunks', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }

    const chunks = await FileChunk.find({ sessionId }).sort({ filename: 1, chunkIndex: 1 }).select('-__v')
    log('file_chunks_fetch', { sessionId, by: uid, count: chunks.length })
    res.json({ chunks })
  } catch (err) {
    log('get_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}
