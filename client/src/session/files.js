import { bufToBase64, base64ToBuf, textEncoder } from '../crypto/keys.js'
import { loadWrappedSession } from '../crypto/keys.js'
import { unwrapSessionKey } from './cryptoSession.js'

// Upload a file in encrypted chunks to the server for a session
export async function uploadFileChunks({ apiUrl, token, sessionId, passphrase, file, senderUsername, chunkSize = 128 * 1024 }) {
  if (!file) throw new Error('file required')
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key stored')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  const totalBytes = file.size
  const totalChunks = Math.ceil(totalBytes / chunkSize)
  let offset = 0
  let chunkIndex = 0
  let counterLocal = Number(localStorage.getItem(`isp:fileCounter:${sessionId}`) || '0')
  // Pre-sync: fetch highest counter seen by server for this session
  try {
    const syncRes = await fetch(`${apiUrl}/api/sessions/state/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })
    if (syncRes.ok) {
      const syncData = await syncRes.json()
      const highestServer = Number(syncData.highestFileCounter || 0)
      if (highestServer > counterLocal) counterLocal = highestServer
    }
  } catch {}

  // Precompute encrypted filename metadata
  const fnameBuf = new TextEncoder().encode(file.name)
  const fnameHashBuf = await crypto.subtle.digest('SHA-256', fnameBuf)
  const filenameHash = bufToBase64(fnameHashBuf)
  const fnameIv = crypto.getRandomValues(new Uint8Array(12))
  const fnameAadString = `${sessionId}|fname|${senderUsername}`
  const fnameAadBuf = new TextEncoder().encode(fnameAadString)
  const fnameCt = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fnameIv, additionalData: fnameAadBuf }, aesKey, fnameBuf.buffer)

  while (offset < totalBytes) {
    const end = Math.min(offset + chunkSize, totalBytes)
    const blob = file.slice(offset, end)
    const chunkBuf = await blob.arrayBuffer()

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const timestampNum = Date.now()
    const counter = ++counterLocal
    const aadString = `${sessionId}|${counter}|${timestampNum}|${senderUsername}|${chunkIndex}`
    const aadBuf = textEncoder.encode(aadString)

    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBuf }, aesKey, chunkBuf)

    const body = {
      sessionId,
      filenameHash,
      filenameIv: bufToBase64(fnameIv.buffer),
      filenameAad: bufToBase64(fnameAadBuf.buffer),
      filenameCiphertext: bufToBase64(fnameCt),
      chunkIndex,
      totalChunks,
      ciphertext: bufToBase64(ct),
      iv: bufToBase64(iv.buffer),
      aad: bufToBase64(aadBuf.buffer),
      counter,
      timestamp: timestampNum
    }

    let res = await fetch(`${apiUrl}/api/files/chunk`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    if (!res.ok && res.status === 409) {
      // Sync highest from server and retry once
      try {
        const syncRes2 = await fetch(`${apiUrl}/api/sessions/state/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })
        if (syncRes2.ok) {
          const syncData2 = await syncRes2.json()
          const highestServer2 = Number(syncData2.highestFileCounter || 0)
          counterLocal = highestServer2
          // rebuild AAD and re-encrypt with new counter
          const counter2 = ++counterLocal
          const aadString2 = `${sessionId}|${counter2}|${Date.now()}|${senderUsername}|${chunkIndex}`
          const aadBuf2 = new TextEncoder().encode(aadString2)
          const iv2 = crypto.getRandomValues(new Uint8Array(12))
          const ct2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2, additionalData: aadBuf2 }, aesKey, chunkBuf)
          const body2 = { ...body, counter: counter2, iv: bufToBase64(iv2.buffer), aad: bufToBase64(aadBuf2.buffer), ciphertext: bufToBase64(ct2) }
          res = await fetch(`${apiUrl}/api/files/chunk`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body2) })
        }
      } catch {}
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      if (res.status === 409) throw new Error('File chunk replay detected (409)')
      throw new Error('Failed to upload chunk: ' + (j.error || res.status))
    }

    offset = end
    chunkIndex++
  }

  localStorage.setItem(`isp:fileCounter:${sessionId}`, String(counterLocal))
  return { ok: true, totalChunks }
}

export async function fetchAndAssembleFile({ apiUrl, token, sessionId, passphrase, filename }) {
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key stored')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)

  // Derive filenameHash from provided filename to query server
  const fnameBuf = new TextEncoder().encode(filename)
  const fnameHashBuf = await crypto.subtle.digest('SHA-256', fnameBuf)
  const filenameHash = bufToBase64(fnameHashBuf)
  const res = await fetch(`${apiUrl}/api/files/${encodeURIComponent(sessionId)}?filenameHash=${encodeURIComponent(filenameHash)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Failed to fetch file chunks')
  const data = await res.json()
  const chunks = (data.chunks || []).sort((a, b) => a.chunkIndex - b.chunkIndex)
  const parts = []
  for (const c of chunks) {
    const ct = base64ToBuf(c.ciphertext)
    const ivBuf = base64ToBuf(c.iv)
    const aadBuf = base64ToBuf(c.aad)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf, additionalData: aadBuf }, aesKey, ct)
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
  return { blob, filename }
}

// Helper to list filenames by decrypting metadata from first chunk per file group
export async function listAvailableFilenames({ apiUrl, token, sessionId, passphrase }) {
  const stored = await loadWrappedSession(sessionId)
  if (!stored || !stored.wrapped) throw new Error('No session key stored')
  const aesKey = await unwrapSessionKey(stored.wrapped, passphrase)
  const res = await fetch(`${apiUrl}/api/files/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('List fetch failed')
  const data = await res.json()
  const chunks = data.chunks || []
  const byHash = new Map()
  for (const c of chunks) {
    if (!byHash.has(c.filenameHash)) byHash.set(c.filenameHash, c)
  }
  const names = []
  for (const [hash, first] of byHash.entries()) {
    try {
      const iv = base64ToBuf(first.filenameIv)
      const aad = base64ToBuf(first.filenameAad)
      const ct = base64ToBuf(first.filenameCiphertext)
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, ct)
      const name = new TextDecoder().decode(new Uint8Array(pt))
      names.push({ filename: name, filenameHash: hash })
    } catch {}
  }
  return names
}
