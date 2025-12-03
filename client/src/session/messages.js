import { base64ToBuf, bufToBase64, updateSessionLastUsed } from '../crypto/keys.js'
import { loadWrappedSession } from '../crypto/keys.js'
import { unwrapSessionKey } from './cryptoSession.js'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function sessionCounterKey(sessionId) {
  return `isp:session:${sessionId}:counter`
}

function loadCounter(sessionId) {
  const v = parseInt(localStorage.getItem(sessionCounterKey(sessionId)) || '0', 10)
  return Number.isFinite(v) ? v : 0
}
function saveCounter(sessionId, c) {
  localStorage.setItem(sessionCounterKey(sessionId), String(c))
}

export async function sendMessage({ apiUrl, token, sessionId, passphrase, plaintext, senderUsername }) {
  // load wrapped session and unwrap
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key stored')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  // get counter and timestamp
  const counter = loadCounter(sessionId) + 1
  const timestamp = new Date().toISOString()

  // AAD = counter|timestamp|senderUsername
  const aad = textEncoder.encode(`${counter}|${timestamp}|${senderUsername}`)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt = textEncoder.encode(plaintext)
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, pt)
  const ciphertext = bufToBase64(ctBuf)
  const ivB64 = bufToBase64(iv.buffer)

  // send to server
  let res = await fetch(`${apiUrl}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId, ciphertext, iv: ivB64, counter, timestamp })
  })
  if (!res.ok) {
    // if replay detected (409), try to sync counter and retry once
    if (res.status === 409) {
      const synced = await syncCounterFromServer({ apiUrl, token, sessionId })
      if (synced) {
        const newCounter = loadCounter(sessionId) + 1
        const newAad = textEncoder.encode(`${newCounter}|${timestamp}|${senderUsername}`)
        const newIv = crypto.getRandomValues(new Uint8Array(12))
        const newCtBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: newIv, additionalData: newAad }, aesKey, pt)
        const newCiphertext = bufToBase64(newCtBuf)
        const newIvB64 = bufToBase64(newIv.buffer)
        res = await fetch(`${apiUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId, ciphertext: newCiphertext, iv: newIvB64, counter: newCounter, timestamp })
        })
      }
    }
    if (!res.ok) throw new Error('Failed to post message')
  }
  // update counter
  saveCounter(sessionId, counter)
  try { await updateSessionLastUsed(sessionId) } catch (e) {}
  return true
}

export async function fetchAndDecrypt({ apiUrl, token, sessionId, passphrase, maxAgeMs = 5*60*1000 }) {
  const res = await fetch(`${apiUrl}/api/messages/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to fetch messages')
  const data = await res.json()
  const msgs = data.messages || []
  const results = []

  // load session key
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key stored')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  let highest = loadCounter(sessionId)

  for (const m of msgs) {
    try {
      // replay/timestamp checks
      if (m.counter <= highest) {
        // skip replay
        continue
      }
      const ts = new Date(m.timestamp)
      if (Math.abs(Date.now() - ts.getTime()) > maxAgeMs) {
        // skip stale
        continue
      }
      const aad = textEncoder.encode(`${m.counter}|${m.timestamp}|${m.senderUsername}`)
      const ivBuf = base64ToBuf(m.iv)
      const ctBuf = base64ToBuf(m.ciphertext)
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf, additionalData: aad }, aesKey, ctBuf)
      const text = textDecoder.decode(new Uint8Array(plainBuf))
      results.push({ id: m._id, sender: m.senderUsername, counter: m.counter, timestamp: m.timestamp, text })
      if (m.counter > highest) highest = m.counter
    } catch (err) {
      // decryption failed — skip and optionally log
      console.warn('decrypt failed for message', m._id, err.message)
      continue
    }
  }

  if (highest > loadCounter(sessionId)) saveCounter(sessionId, highest)
  try { await updateSessionLastUsed(sessionId) } catch (e) {}
  return results
}

// Sync local counter from server messages without decrypting
export async function syncCounterFromServer({ apiUrl, token, sessionId }) {
  try {
    const res = await fetch(`${apiUrl}/api/messages/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return false
    const data = await res.json()
    const msgs = data.messages || []
    let maxCounter = loadCounter(sessionId)
    for (const m of msgs) {
      if (typeof m.counter === 'number' && m.counter > maxCounter) maxCounter = m.counter
    }
    saveCounter(sessionId, maxCounter)
    try { await updateSessionLastUsed(sessionId) } catch {}
    return true
  } catch {
    return false
  }
}
