// Client-side session crypto helpers: ephemeral key generation, sign/verify, ECDH derive, HKDF derive, wrap session key
import { textEncoder, textDecoder, bufToBase64, base64ToBuf } from '../crypto/keys.js'

export async function generateEphemeral() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
  return kp
}

export async function exportPublicJWK(key) {
  return crypto.subtle.exportKey('jwk', key)
}

export async function importPublicECDH(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

export async function importPrivateECDH(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
}

export async function importPublicECDSA(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify'])
}

export async function importPrivateECDSA(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
}

export async function signECDSA(privateKey, dataBuf) {
  // dataBuf: ArrayBuffer
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, dataBuf)
  return bufToBase64(sig)
}

export async function verifyECDSA(publicKey, dataBuf, sigB64) {
  const sigBuf = base64ToBuf(sigB64)
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, sigBuf, dataBuf)
}

export async function deriveSharedSecret(privKey, pubKey) {
  // returns raw bits as ArrayBuffer
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pubKey }, privKey, 256)
  return bits
}

export async function hkdfDeriveKey(rawSecret, saltBuffer, infoText) {
  // rawSecret: ArrayBuffer
  const keyMaterial = await crypto.subtle.importKey('raw', rawSecret, 'HKDF', false, ['deriveKey'])
  const salt = saltBuffer
  const info = textEncoder.encode(infoText)
  const derived = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  return derived
}

export async function exportRawKey(key) {
  return crypto.subtle.exportKey('raw', key)
}

// Wrap session key (AES-GCM) by exporting raw key and using the same PBKDF2->AES-GCM wrap used elsewhere
import { deriveWrappingKey } from '../crypto/keys.js'
export async function wrapSessionKey(aesKey, passphrase) {
  const raw = await exportRawKey(aesKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveWrappingKey(passphrase, salt.buffer)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, raw)
  return { ciphertext: bufToBase64(ct), iv: bufToBase64(iv.buffer), salt: bufToBase64(salt.buffer) }
}

export async function unwrapSessionKey(wrapped, passphrase) {
  const salt = base64ToBuf(wrapped.salt)
  const iv = base64ToBuf(wrapped.iv)
  const ct = base64ToBuf(wrapped.ciphertext)
  const wrappingKey = await deriveWrappingKey(passphrase, salt)
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, ct)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

// helper to assemble signed payload
export function buildSignedData(nonceB64, timestampISO, pubJwk) {
  // canonical ordering: nonce || timestamp || JSON.stringify(pubJwk)
  const pubStr = JSON.stringify(pubJwk)
  const parts = [nonceB64, timestampISO, pubStr]
  return textEncoder.encode(parts.join('|'))
}
