// Lightweight client-side key management using Web Crypto API
// - Generates ECDH (P-256) and ECDSA (P-256) keypairs
// - Exports public keys as JWK for upload/distribution
// - Wraps private JWK with AES-GCM using a key derived from a passphrase via PBKDF2

export const textEncoder = new TextEncoder()
export const textDecoder = new TextDecoder()

export function bufToBase64(buf) {
  const u8 = new Uint8Array(buf)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < u8.length; i += CHUNK) {
    const sub = u8.subarray(i, Math.min(i + CHUNK, u8.length))
    binary += String.fromCharCode.apply(null, sub)
  }
  return btoa(binary)
}
export function base64ToBuf(b64) {
  const str = atob(b64)
  const arr = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i)
  return arr.buffer
}

// Identity keys: Only ECDSA for long-term identity (sign/verify)
export async function generateIdentityEcdsa() {
  const ecdsa = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return { ecdsa }
}

// Ephemeral session keys: ECDH is generated per-session elsewhere (not persisted here)

export async function exportPublicJWK(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return jwk
}

export async function exportPrivateJWK(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key)
  return jwk
}

export async function deriveWrappingKey(passphrase, salt) {
  const passKey = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  return key
}

// wrap JWK (stringified) with AES-GCM using passphrase-derived key
export async function wrapPrivateJWK(jwkObject, passphrase) {
  const jwkString = JSON.stringify(jwkObject)
  const data = textEncoder.encode(jwkString)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt.buffer)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, data)
  return {
    ciphertext: bufToBase64(ct),
    iv: bufToBase64(iv.buffer),
    salt: bufToBase64(salt.buffer)
  }
}

export async function unwrapPrivateJWK(wrapped, passphrase) {
  try {
    const salt = base64ToBuf(wrapped.salt)
    const iv = base64ToBuf(wrapped.iv)
    const ct = base64ToBuf(wrapped.ciphertext)
    const wrappingKey = await deriveWrappingKey(passphrase, salt)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, ct)
    const jwkString = textDecoder.decode(new Uint8Array(plaintext))
    return JSON.parse(jwkString)
  } catch (err) {
    throw new Error('Failed to unwrap private key: ' + err.message)
  }
}

// Simple IndexedDB helpers for storing keys
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('isp-keys', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storeWrappedKey(keyName, wrappedObj) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite')
    const store = tx.objectStore('keys')
    const req = store.put(wrappedObj, keyName)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export async function getWrappedKey(keyName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly')
    const store = tx.objectStore('keys')
    const req = store.get(keyName)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteWrappedKey(keyName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite')
    const store = tx.objectStore('keys')
    const req = store.delete(keyName)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

// Expose helpers for session storage in IndexedDB (a separate store)
export async function openSessionDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('isp-sessions', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function storeWrappedSession(sessionId, wrappedObj) {
  const db = await openSessionDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const req = store.put(wrappedObj, sessionId)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export async function loadWrappedSession(sessionId) {
  const db = await openSessionDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readonly')
    const store = tx.objectStore('sessions')
    const req = store.get(sessionId)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Find a locally stored session which lists the given participant in its metadata
export async function findSessionByParticipant(participantUsername) {
  const db = await openSessionDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const req = store.openCursor()
    req.onsuccess = (evt) => {
      const cursor = evt.target.result
      if (!cursor) return resolve(null)
      const key = cursor.key
      const value = cursor.value
      try {
        if (value && value.meta && Array.isArray(value.meta.participants) && value.meta.participants.includes(participantUsername)) {
          // check expiry: lastUsedAt
          const last = value.meta.lastUsedAt || 0
          const now = Date.now()
          const TEN_MIN = 10 * 60 * 1000
          if (now - last > TEN_MIN) {
            // expired -> delete this session and continue
            const delReq = store.delete(key)
            delReq.onsuccess = () => cursor.continue()
            delReq.onerror = () => cursor.continue()
            return
          }
          return resolve({ sessionId: key, session: value })
        }
      } catch (e) {
        // ignore and continue
      }
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

export async function deleteSession(sessionId) {
  const db = await openSessionDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const req = store.delete(sessionId)
    req.onsuccess = () => resolve(true)
    req.onerror = () => reject(req.error)
  })
}

export async function updateSessionLastUsed(sessionId) {
  const db = await openSessionDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const req = store.get(sessionId)
    req.onsuccess = (evt) => {
      const val = evt.target.result
      if (!val) return resolve(false)
      if (!val.meta) val.meta = {}
      val.meta.lastUsedAt = Date.now()
      const putReq = store.put(val, sessionId)
      putReq.onsuccess = () => resolve(true)
      putReq.onerror = () => reject(putReq.error)
    }
    req.onerror = () => reject(req.error)
  })
}

// Convenience user-scoped storage helpers
export async function saveWrappedKeys(userId, wrappedObj) {
  if (!userId) throw new Error('userId required')
  const keyName = `user:${userId}`
  return storeWrappedKey(keyName, wrappedObj)
}

export async function loadWrappedKeys(userId) {
  if (!userId) throw new Error('userId required')
  const keyName = `user:${userId}`
  return getWrappedKey(keyName)
}
