import * as cs from './cryptoSession.js'
import { GROUP_TAG, HKDF_INFO_SESSION, AAD_HANDSHAKE_PREFIX } from '../constants/protocol.js'
import { loadWrappedKeys, unwrapPrivateJWK, wrapPrivateJWK, storeWrappedSession } from '../crypto/keys.js'

const usedNoncesKey = 'isp:seen_nonces'
function loadUsedNonces() {
  try { return new Set(JSON.parse(localStorage.getItem(usedNoncesKey) || '[]')) } catch { return new Set() }
}
function saveUsedNonces(set) { localStorage.setItem(usedNoncesKey, JSON.stringify([...set])) }

export async function startSession({ apiUrl, token, myUserId, myUsername, passphrase, targetUsername }) {
  // Pre-checks: existing local session or peer INIT in inbox
  try {
    const existing = await checkExistingSession(targetUsername)
    if (existing) return { sessionId: existing }
  } catch (e) {}
  try {
    const peerInit = await checkInboxForPeerInit(apiUrl, token, targetUsername)
    if (peerInit) {
      // act as responder
      const handled = await handleIncomingInit(apiUrl, token, peerInit, myUserId, myUsername, passphrase)
      await fetch(`${apiUrl}/api/sessions/consume/${peerInit._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      return { sessionId: handled.sessionId }
    }
  } catch (e) {}

  // unwrap my ECDSA private key
  const stored = await loadWrappedKeys(myUserId)
  if (!stored || !stored.wrapped) throw new Error('No identity keys stored')
  const myEcdsaJwk = await unwrapPrivateJWK(stored.wrapped.ecdsa, passphrase)
  const myEcdhJwk = await unwrapPrivateJWK(stored.wrapped.ecdh, passphrase)
  const myEcdsaKey = await cs.importPrivateECDSA(myEcdsaJwk)

  // generate ephemeral ECDH key
  const eph = await cs.generateEphemeral()
  const ephPub = await cs.exportPublicJWK(eph.publicKey)

  // build nonce and timestamp
  const nonce = crypto.getRandomValues(new Uint8Array(16))
  const nonceB64 = btoa(String.fromCharCode(...new Uint8Array(nonce)))
  const timestamp = new Date().toISOString()

  // build data to sign
  // Build signature input per group-unique format
  const ephPubB64 = btoa(JSON.stringify(ephPub))
  const toSignInitBuf = cs.buildInitSignatureInput({ initId: 'init-pending', from: myUsername, to: targetUsername, ephemeralPubB64: ephPubB64, nonceB64, timestamp })
  const sig = await cs.signECDSA(myEcdsaKey, toSignInitBuf)

  // send SESSION_INIT to server
  const payload = { from: myUsername, to: targetUsername, ephemeral: ephPub, nonce: nonceB64, timestamp, signature: sig, group: GROUP_TAG }
  const res = await fetch(`${apiUrl}/api/sessions/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ toUsername: targetUsername, payload })
  })
  if (!res.ok) throw new Error('Failed to send SESSION_INIT')
  const dataRes = await res.json()
  const initId = dataRes.id

  // mark locally that we initiated toward this target to prevent accidental re-init
  try { localStorage.setItem(`isp:initiated:${targetUsername}`, initId) } catch (e) {}

  // save sent nonce as used
  const used = loadUsedNonces()
  used.add(nonceB64)
  saveUsedNonces(used)

  // wait/poll for reply (simple polling, could be improved with websockets)
  const reply = await pollForReply(apiUrl, token, initId)
  if (!reply) throw new Error('No reply received')

  // verify reply signature and compute shared secret
  const sender = reply.fromUsername || targetUsername
  // fetch sender public keys
  const pubRes = await fetch(`${apiUrl}/api/keys/${sender}`)
  if (!pubRes.ok) throw new Error('Failed to fetch sender public keys')
  const pubData = await pubRes.json()
  const senderPubEcdsaJwk = pubData.public.ecdsa
  const senderEcdsaKey = await cs.importPublicECDSA(senderPubEcdsaJwk)

  // verify reply signature
  const replyPayload = reply.payload
  const replyEphB64 = btoa(JSON.stringify(replyPayload.ephemeral))
  const replyInputBuf = cs.buildReplySignatureInput({ inReplyTo: initId, from: sender, ephemeralPubB64: replyEphB64, nonceB64: replyPayload.nonce, timestamp: replyPayload.timestamp })
  const valid = await cs.verifyECDSA(senderEcdsaKey, replyInputBuf, replyPayload.signature)
  if (!valid) {
    // log invalid signature
    await fetch(`${apiUrl}/api/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'invalid_reply_signature', details: { from: sender, to: myUsername } }) })
    throw new Error('Invalid reply signature')
  }

  // check timestamp
  const ts = new Date(replyPayload.timestamp)
  if (Math.abs(Date.now() - ts.getTime()) > 2 * 60 * 1000) {
    throw new Error('Reply timestamp too old')
  }

  // check nonce
  const used2 = loadUsedNonces()
  if (used2.has(replyPayload.nonce)) {
    throw new Error('Replay detected: nonce already used')
  }
  used2.add(replyPayload.nonce)
  saveUsedNonces(used2)

  // derive shared secret using our ephemeral private and reply ephemeral public
  const theirEphPubKey = await cs.importPublicECDH(replyPayload.ephemeral)
  const shared = await cs.deriveSharedSecret(eph.privateKey, theirEphPubKey)
  // Use canonical session id from reply.payload.inReplyTo if present, otherwise fall back to our initId
  const canonicalInitId = (replyPayload && replyPayload.inReplyTo) ? replyPayload.inReplyTo : initId
  // Deterministic HKDF salt from both nonces and canonical init id
  const saltText = `${nonceB64}|${replyPayload.nonce}|${canonicalInitId}|${GROUP_TAG}`
  const saltHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltText))
  const aesKey = await cs.hkdfDeriveKey(shared, saltHash, HKDF_INFO_SESSION)

  // wrap and store session key
  const wrapped = await cs.wrapSessionKey(aesKey, passphrase)
  // store under canonical id (overwrite any provisional stored under initId)
  await storeWrappedSession(canonicalInitId, { wrapped, meta: { participants: [myUsername, targetUsername], lastUsedAt: Date.now() } })
  // clear initiated flag
  try { localStorage.removeItem(`isp:initiated:${targetUsername}`) } catch (e) {}

  // Send KEY_CONFIRM encrypted with the derived session key
  try {
    const confirmTs = new Date().toISOString()
    const confirmText = `cl-key-confirm|v2022|${GROUP_TAG}|${canonicalInitId}|${nonceB64}|${replyPayload.nonce}|${timestamp}|${replyPayload.timestamp}`
    const aadString = `${AAD_HANDSHAKE_PREFIX}|confirm|${canonicalInitId}|${myUsername}|${confirmTs}`
    const { ciphertext, ivB64 } = await cs.encryptWithAesGcm(aesKey, confirmText, aadString)
    const confRes = await fetch(`${apiUrl}/api/sessions/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ toUsername: sender, payload: { sessionId: canonicalInitId, ciphertext, iv: ivB64, aad: aadString, timestamp: confirmTs, group: GROUP_TAG } })
    })
    if (!confRes.ok) {
      // non-fatal; proceed but log server-side
      await fetch(`${apiUrl}/api/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'key_confirm_post_failed', details: { sessionId: canonicalInitId } }) })
    }
  } catch (e) {
    // non-fatal; proceed
  }

  return { sessionId: canonicalInitId }
}

// Check if there's an existing local session for this participant
export async function checkExistingSession(targetUsername) {
  try {
    const keys = await import('../crypto/keys.js')
    const existing = await keys.findSessionByParticipant(targetUsername)
    return existing && existing.sessionId ? existing.sessionId : null
  } catch (e) {
    return null
  }
}

// Check inbox for any unhandled SESSION_INIT from targetUsername; returns the message object or null
export async function checkInboxForPeerInit(apiUrl, token, targetUsername) {
  const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Inbox fetch failed')
  const data = await res.json()
  const msgs = data.messages || []
  const now = Date.now()
  const MAX_MS = 10 * 60 * 1000
  for (const m of msgs) {
    try {
      if (m.type === 'SESSION_INIT' && m.payload && m.payload.from === targetUsername) {
        const ts = new Date(m.payload.timestamp).getTime()
        if (Number.isFinite(ts) && Math.abs(now - ts) <= MAX_MS) return m
        // stale -> skip
      }
    } catch (e) {
      continue
    }
  }
  return null
}

// Helper to check whether we previously initiated toward a target
export function getInitiatedFlag(targetUsername) {
  try { return localStorage.getItem(`isp:initiated:${targetUsername}`) } catch (e) { return null }
}

// Helper: check whether wrapped identity keys exist locally for a user
export async function checkLocalKeys(myUserId) {
  try {
    const stored = await loadWrappedKeys(myUserId)
    return stored && stored.wrapped ? stored : null
  } catch (e) {
    return null
  }
}

// Helper: verify that the provided passphrase can unwrap identity private keys
export async function verifyPassphrase(myUserId, passphrase) {
  try {
    const stored = await loadWrappedKeys(myUserId)
    if (!stored || !stored.wrapped) return false
    // attempt to unwrap ECDSA and ECDH private keys
    await unwrapPrivateJWK(stored.wrapped.ecdsa, passphrase)
    await unwrapPrivateJWK(stored.wrapped.ecdh, passphrase)
    return true
  } catch (e) {
    return false
  }
}

// Helper: check inbox once and handle any incoming SESSION_INIT messages
// Returns an object { sessionId } when a session was established, otherwise null
export async function checkAndHandleInboxOnce(apiUrl, token, myUserId, myUsername, passphrase, targetUsername) {
  const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Inbox fetch failed')
  const data = await res.json()
  const msgs = data.messages || []
  const now = Date.now()
  const MAX_MS = 10 * 60 * 1000
  for (const m of msgs) {
    if (m.type === 'SESSION_INIT') {
      // if targetUsername provided, only handle INIT from that user
      if (targetUsername && !(m.payload && m.payload.from === targetUsername)) continue
      try {
        const ts = new Date(m.payload && m.payload.timestamp).getTime()
        if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_MS) {
          // stale init -> skip
          continue
        }
        const handledRes = await handleIncomingInit(apiUrl, token, m, myUserId, myUsername, passphrase)
        // mark consumed
        await fetch(`${apiUrl}/api/sessions/consume/${m._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        return { sessionId: handledRes.sessionId }
      } catch (e) {
        // continue to next message
        continue
      }
    }
  }
  return null
}

// Accept a specific INIT by message id for precise handling
export async function acceptInitById(apiUrl, token, initMessageId, myUserId, myUsername, passphrase) {
  const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error('Inbox fetch failed')
  const data = await res.json()
  const msgs = data.messages || []
  const m = msgs.find(x => x._id === initMessageId && x.type === 'SESSION_INIT')
  if (!m) return null
  const handledRes = await handleIncomingInit(apiUrl, token, m, myUserId, myUsername, passphrase)
  await fetch(`${apiUrl}/api/sessions/consume/${m._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  return { sessionId: handledRes.sessionId }
}

async function pollForReply(apiUrl, token, initId, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Inbox fetch failed')
    const data = await res.json()
    const msgs = data.messages || []
    for (const m of msgs) {
      if (m.type === 'SESSION_REPLY' && m.payload && m.payload.inReplyTo === initId) {
        // mark consumed
        await fetch(`${apiUrl}/api/sessions/consume/${m._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        return m
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  return null
}

export async function handleIncomingInit(apiUrl, token, message, myUserId, myUsername, passphrase) {
  // message.payload contains from, ephemeral, nonce, timestamp, signature
  const payload = message.payload
  const sender = payload.from
  // verify signature using sender's public ECDSA
  const pubRes = await fetch(`${apiUrl}/api/keys/${sender}`)
  if (!pubRes.ok) throw new Error('Failed to fetch sender public keys')
  const pubData = await pubRes.json()
  const senderEcdsaKey = await cs.importPublicECDSA(pubData.public.ecdsa)
  const initEphB64 = btoa(JSON.stringify(payload.ephemeral))
  // Initiator signs before knowing server id; use canonical placeholder 'init-pending' for verification
  const initInputBuf = cs.buildInitSignatureInput({ initId: 'init-pending', from: sender, to: myUsername, ephemeralPubB64: initEphB64, nonceB64: payload.nonce, timestamp: payload.timestamp })
  const ok = await cs.verifyECDSA(senderEcdsaKey, initInputBuf, payload.signature)
  if (!ok) {
    // log and reject
    await fetch(`${apiUrl}/api/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'invalid_init_signature', details: { from: sender, to: myUsername } }) })
    throw new Error('Invalid signature on SESSION_INIT')
  }
  // timestamp check
  const ts = new Date(payload.timestamp)
  if (Math.abs(Date.now() - ts.getTime()) > 2 * 60 * 1000) throw new Error('SESSION_INIT timestamp too old')
  // nonce replay check
  const used = loadUsedNonces()
  if (used.has(payload.nonce)) throw new Error('Replay detected')
  used.add(payload.nonce)
  saveUsedNonces(used)

  // generate ephemeral response
  const eph = await cs.generateEphemeral()
  const ephPub = await cs.exportPublicJWK(eph.publicKey)

  // derive shared secret using our ephemeral private and initiator ephemeral public
  const theirPub = await cs.importPublicECDH(payload.ephemeral)
  const shared = await cs.deriveSharedSecret(eph.privateKey, theirPub)
  // Prepare responder nonce and timestamp for reply
  const nonceB = crypto.getRandomValues(new Uint8Array(16))
  const nonceB64 = btoa(String.fromCharCode(...new Uint8Array(nonceB)))
  const timestampB = new Date().toISOString()

  // Deterministic HKDF salt from initiator nonce, responder nonce, and canonical init id (init message id)
  const initId = message._id
  const saltText = `${payload.nonce}|${nonceB64}|${initId}|${GROUP_TAG}`
  const saltHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltText))
  const aesKey = await cs.hkdfDeriveKey(shared, saltHash, HKDF_INFO_SESSION)

  // unwrap our identity private key to sign reply
  const stored = await loadWrappedKeys(myUserId)
  if (!stored || !stored.wrapped) throw new Error('No identity keys stored')
  const myEcdsaJwk = await unwrapPrivateJWK(stored.wrapped.ecdsa, passphrase)
  const myEcdsaKey = await cs.importPrivateECDSA(myEcdsaJwk)

  const replyEphB64 = btoa(JSON.stringify(ephPub))
  const replySignBuf = cs.buildReplySignatureInput({ inReplyTo: initId, from: myUsername, ephemeralPubB64: replyEphB64, nonceB64, timestamp: timestampB })
  const sig = await cs.signECDSA(myEcdsaKey, replySignBuf)

  const replyPayload = { ephemeral: ephPub, nonce: nonceB64, timestamp: timestampB, signature: sig, inReplyTo: message._id, group: GROUP_TAG }
  // send reply
  const resp = await fetch(`${apiUrl}/api/sessions/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ toUsername: sender, payload: replyPayload }) })
  if (!resp.ok) throw new Error('Failed to send reply')
  const respJson = await resp.json()
  const replyId = respJson.id

  // store wrapped session key under the original init message id so both sides use the same canonical sessionId
  const wrapped = await cs.wrapSessionKey(aesKey, passphrase)
  await storeWrappedSession(initId, { wrapped, meta: { participants: [myUsername, sender], lastUsedAt: Date.now() } })

  // Wait briefly for KEY_CONFIRM message from initiator and verify
  try {
    const confirm = await pollForKeyConfirm(apiUrl, token, initId)
    if (confirm && confirm.payload) {
      const aadString = confirm.payload.aad
      const pt = await cs.decryptWithAesGcm(aesKey, confirm.payload.ciphertext, confirm.payload.iv, aadString)
      // minimal sanity check: payload must match our expected session/nonces
      if (!(typeof pt === 'string' && pt.includes(initId) && pt.includes(payload.nonce) && pt.includes(nonceB64))) {
        await fetch(`${apiUrl}/api/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ event: 'key_confirm_invalid_plaintext', details: { sessionId: initId } }) })
      }
      // mark consumed
      await fetch(`${apiUrl}/api/sessions/consume/${confirm._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    }
  } catch (e) {
    // non-fatal; proceed
  }

  return { sessionId: initId }
}

async function pollForKeyConfirm(apiUrl, token, sessionId, attempts = 15) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error('Inbox fetch failed')
    const data = await res.json()
    const msgs = data.messages || []
    for (const m of msgs) {
      if (m.type === 'KEY_CONFIRM' && m.payload && m.payload.sessionId === sessionId) {
        return m
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
  return null
}
