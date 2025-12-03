import FileChunk from '../models/FileChunk.js'
import User from '../models/User.js'
import Log from '../models/Log.js'
import SessionState from '../models/SessionState.js'
import { writeLog } from '../utils/logger.js'

function log(event, details) {
  console.log(`[files] ${event}`, details);
  Log.create({ event, details }).catch(()=>{})
}

export async function postFileChunk(req, res) {
  try {
    const uid = req.user?.uid
    if (!uid) return res.status(401).json({ error: 'Unauthorized' })
    const { sessionId, filenameHash, filenameIv, filenameAad, filenameCiphertext, chunkIndex, totalChunks, ciphertext, iv, aad, counter, timestamp } = req.body
    if (!sessionId || !filenameHash || !filenameIv || !filenameAad || !filenameCiphertext || typeof chunkIndex !== 'number' || typeof totalChunks !== 'number' || !ciphertext || !iv || !aad || typeof counter !== 'number' || !timestamp) return res.status(400).json({ error: 'Missing fields' })

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    // Authorization: ensure user is a participant in the session
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      log('authorization_violation', { action: 'postFileChunk', sessionId, attemptedBy: user.username })
      writeLog('server_side_metadata_access', { event: 'authorization_violation', route: 'files/chunk', sessionId, attemptedBy: user.username })
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
      writeLog('detected_replay_attack', { type: 'file', sessionId, sender: user.username, counter, highestSeen: session.highestFileCounter })
      await Log.create({ event: 'file_replay_detected', details: { sessionId, sender: user.username, counter, highestSeen: session.highestFileCounter } }).catch(()=>{})
      return res.status(409).json({ error: 'Replay detected' })
    }

    // store the file chunk
    await FileChunk.create({ sessionId, filenameHash, filenameIv, filenameAad, filenameCiphertext, chunkIndex, totalChunks, senderUserId: uid, senderUsername: user.username, ciphertext, iv, aad, counter, timestamp: new Date(timestamp) })

    // update highest file counter
    session.highestFileCounter = Math.max(session.highestFileCounter || 0, counter)
    session.updatedAt = new Date()
    await session.save()

    log('file_chunk_stored', { sessionId, chunkIndex, sender: user.username, counter })
    writeLog('server_side_metadata_access', { route: 'files/chunk', sessionId, chunkIndex, sender: user.username })
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
    const { filename } = req.query

    const user = await User.findById(uid)
    if (!user) return res.status(404).json({ error: 'User not found' })
    const session = await SessionState.findOne({ sessionId })
    if (!session || !((session.initiatorUsername === user.username) || (session.responderUsername === user.username))) {
      log('authorization_violation', { action: 'getFileChunks', sessionId, attemptedBy: user.username })
      writeLog('server_side_metadata_access', { event: 'authorization_violation', route: 'files/get', sessionId, attemptedBy: user.username })
      await Log.create({ event: 'authorization_violation', details: { action: 'getFileChunks', sessionId, attemptedBy: user.username } }).catch(()=>{})
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { filenameHash } = req.query
    const q = filenameHash ? { sessionId, filenameHash } : { sessionId }
    const chunks = await FileChunk.find(q).sort({ chunkIndex: 1 }).select('filenameHash filenameIv filenameAad filenameCiphertext chunkIndex totalChunks iv aad ciphertext timestamp senderUsername')
    log('file_chunks_fetch', { sessionId, by: uid, count: chunks.length })
    writeLog('server_side_metadata_access', { route: 'files/get', sessionId, byUserId: uid, count: chunks.length })
    res.json({ chunks })
  } catch (err) {
    log('get_error', { message: err.message })
    res.status(500).json({ error: 'Server error' })
  }
}
