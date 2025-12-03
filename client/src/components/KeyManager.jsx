import { useState, useEffect } from 'react'
import { generateIdentityEcdsa, exportPublicJWK, exportPrivateJWK, wrapPrivateJWK, unwrapPrivateJWK, saveWrappedKeys, loadWrappedKeys } from '../crypto/keys.js'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/forms.css'
import keyIcon from '../assets/icons/vpn_key.png'

export default function KeyManager() {
  const { user, token } = useAuth()
  const userId = user?.id
  const [status, setStatus] = useState('')
  const [pubEcdsa, setPubEcdsa] = useState(null)
  const [tempPrivate, setTempPrivate] = useState(null)
  const [hasStored, setHasStored] = useState(false)
  const [passphrase, setPassphrase] = useState('')

  // Check if wrapped keys already exist for this user
  useEffect(() => {
    let mounted = true
    async function check() {
      if (!userId) return setHasStored(false)
      try {
        const existing = await loadWrappedKeys(userId)
        if (mounted) {
          setHasStored(!!existing)
          if (existing && existing.public) {
            setPubEcdsa(existing.public.ecdsa)
          }
        }
      } catch (err) {
        console.warn('loadWrappedKeys error', err)
        if (mounted) setHasStored(false)
      }
    }
    check()
    return () => { mounted = false }
  }, [userId])

  // Clear in-memory private keys when user logs out
  useEffect(() => {
    if (!user) {
      setTempPrivate(null)
      setPassphrase('')
      setHasStored(false)
      setPubEcdsa(null)
      setStatus('')
    }
  }, [user])

  const makeKeys = async () => {
    if (!userId) return setStatus('You must be logged in to generate identity keys')
    // If keys already stored, do not regenerate; instruct user to unlock or regenerate explicitly
    if (hasStored) {
      return setStatus('Identity keys already exist for this account. Use Unlock or Regenerate (dangerous).')
    }
    if (!passphrase) return setStatus('Enter a local passphrase to protect your private keys before generating')
    setStatus('Generating identity keys (ECDSA only)...')
    try {
      const { ecdsa } = await generateIdentityEcdsa()
      const pubS = await exportPublicJWK(ecdsa.publicKey)
      setPubEcdsa(pubS)
      // export private jwks
      const sPriv = await exportPrivateJWK(ecdsa.privateKey)
      // wrap immediately using provided passphrase
      const wrappedEcdsa = await wrapPrivateJWK(sPriv, passphrase)
      const saved = { public: { ecdsa: pubS }, wrapped: { ecdsa: wrappedEcdsa } }
      await saveWrappedKeys(userId, saved)
      setTempPrivate(null)
      setHasStored(true)
      setStatus('Identity keys generated, wrapped, and stored locally.')
      // upload public keys to server so others can find them
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'
        const res = await fetch(`${apiUrl}/api/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ecdsa: pubS })
        })
        if (res.ok) {
          setStatus(s => s + ' Public keys uploaded to server.')
        } else {
          const d = await res.json().catch(() => ({}))
          setStatus(s => s + ` Public key upload failed: ${d.error || res.status}`)
        }
      } catch (err) {
        setStatus(s => s + ' Public key upload error: ' + err.message)
      }
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
  }

  const loadPrivate = async (pass) => {
    if (!userId) return setStatus('You must be logged in to load keys')
    setStatus('Unwrapping...')
    try {
      const stored = await loadWrappedKeys(userId)
      if (!stored || !stored.wrapped || !stored.wrapped.ecdsa) throw new Error('No wrapped ECDSA key stored for this account')
      const jwkS = await unwrapPrivateJWK(stored.wrapped.ecdsa, pass)
      setTempPrivate({ ecdsaPrivate: jwkS })
      setStatus('Unwrap success. Private keys loaded in memory.')
    } catch (err) {
      setStatus('Error unwrapping keys: ' + err.message)
    }
  }

  const lockKeys = () => {
    setTempPrivate(null)
    setStatus('Private keys locked (cleared from memory).')
  }

  return (
    <div className="card">
      <button onClick={() => window.history.back()} className="back-button" style={{ marginBottom: 8 }}>
        ← Back
      </button>
      <h3><img src={keyIcon} className="icon-sm" alt="keys" />Key Manager</h3>
      <p className="small">{status}</p>

      <div className="form-row">
        <label><img src={keyIcon} className="icon-sm" alt="keys" />Identity keys</label>
        <div className="small">Long-term keys used to identify you. Generated once and stored locally.</div>
        {!hasStored && (
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={makeKeys}><img src={keyIcon} className="icon-sm" alt="keys" />Generate Identity Keys</button>
          </div>
        )}
        {hasStored && (
          <div style={{ marginTop: 8 }}>
            <div className="small">Identity keys are already stored for this account.</div>
          </div>
        )}
      </div>

      {pubEcdsa && (
        <div className="form-row">
          <label><img src={keyIcon} className="icon-sm" alt="keys" />Public Keys</label>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ ecdsa: pubEcdsa }, null, 2)}</pre>
        </div>
      )}

      <div className="form-row">
        <label>Local passphrase</label>
        <input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} />
        <div style={{ marginTop: 6 }}>
          {tempPrivate ? (
            <button className="btn" onClick={lockKeys}><img src={keyIcon} className="icon-sm" alt="keys" />Lock Keys</button>
          ) : (
            hasStored ? (
              <button className="btn" onClick={() => loadPrivate(passphrase)}><img src={keyIcon} className="icon-sm" alt="keys" />Unlock Keys</button>
            ) : (
              <button className="btn" onClick={makeKeys}><img src={keyIcon} className="icon-sm" alt="keys" />Generate Identity Keys</button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
