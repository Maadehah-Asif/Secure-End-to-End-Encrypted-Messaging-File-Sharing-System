import { bufToBase64, base64ToBuf, textEncoder } from '../crypto/keys.js'
import { loadWrappedSession } from '../crypto/keys.js'
import { unwrapSessionKey } from './cryptoSession.js'

// Upload a file in encrypted chunks to the server for a session
export async function uploadFileChunks({ apiUrl, token, sessionId, passphrase, file, senderUsername, chunkSize = 256 * 1024 }) {
  if (!file) throw new Error('file required')
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key found')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  const total = file.size
  let offset = 0
  let index = 0
  while (offset < total) {
    const end = Math.min(offset + chunkSize, total)
    const blob = file.slice(offset, end)
    const chunkBuf = await blob.arrayBuffer()

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const counter = Date.now() + index
    const timestamp = new Date().toISOString()
    const aad = `${counter}|${timestamp}|${senderUsername}`

    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: textEncoder.encode(aad) }, aesKey, chunkBuf)

    const body = {
      sessionId,
      filename: file.name,
      chunkIndex: index,
      ciphertext: bufToBase64(ct),
      iv: bufToBase64(iv.buffer),
      counter,
      timestamp
    }

    const res = await fetch(`${apiUrl}/api/files/chunk`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error('Failed to upload chunk: ' + txt)
    }

    offset = end
    index++
  }

  return { ok: true }
}

export async function fetchAndAssembleFile({ apiUrl, token, sessionId, passphrase, filename }) {
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key found')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  const res = await fetch(`${apiUrl}/api/files/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to fetch file chunks')
  const data = await res.json()
  const chunks = (data.chunks || []).filter(c => c.filename === filename).sort((a, b) => a.chunkIndex - b.chunkIndex)
  const parts = []
  for (const c of chunks) {
    const ct = base64ToBuf(c.ciphertext)
    const iv = base64ToBuf(c.iv)
    const aad = `${c.counter}|${new Date(c.timestamp).toISOString()}|${c.senderUsername}`
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.slice(0,12), additionalData: textEncoder.encode(aad) }, aesKey, ct)
    parts.push(new Uint8Array(plain))
  }

  // concatenate
  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(totalLen)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }

  const blob = new Blob([out])
  return blob
}
