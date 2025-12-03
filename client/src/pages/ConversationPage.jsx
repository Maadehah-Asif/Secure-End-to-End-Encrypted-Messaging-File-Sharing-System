import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import * as sm from '../session/sessionManager.js'
import MainLayout from '../components/MainLayout.jsx'
import '../styles/forms.css'

export default function ConversationPage() {
  const { username: targetUsername } = useParams()
  const { user, token } = useAuth()

  const [passphrase, setPassphrase] = useState('')
  const [keysUnlocked, setKeysUnlocked] = useState(false)
  const [status, setStatus] = useState('')
  const [sessionId, setSessionId] = useState(null)
  const [sessionEstablished, setSessionEstablished] = useState(false)
  const [sessionExists, setSessionExists] = useState(false)
  const [incomingInitExists, setIncomingInitExists] = useState(false)
  const [incomingList, setIncomingList] = useState([])
  const [canCompose, setCanCompose] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMsg, setNewMsg] = useState('')

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

  useEffect(() => {
    // clear transient status on mount
    setStatus('')
  }, [targetUsername])
  // After a session is established, perform a one-time sync fetch to update local counter
  useEffect(() => {
    if (!sessionEstablished || !sessionId) return
    const sync = async () => {
      try {
        const { syncCounterFromServer } = await import('../session/messages.js')
        await syncCounterFromServer({ apiUrl, token, sessionId })
      } catch (e) {
        // ignore; user can manually refresh
      }
    }
    sync()
  }, [sessionEstablished, sessionId])

  // Unlock keys handler
  const unlockKeys = async () => {
    setStatus('Unlocking keys...')
    try {
      // check for wrapped keys presence
      const stored = await sm.checkLocalKeys(user.id)
      if (!stored) {
        setStatus('No identity keys found. Generate them in Dashboard → Key Manager.')
        return
      }
      // verify passphrase by attempting unwrap
      const ok = await sm.verifyPassphrase(user.id, passphrase)
      if (!ok) {
        setStatus('Incorrect passphrase')
        return
      }
      setKeysUnlocked(true)
      setStatus('Keys unlocked')
    } catch (err) {
      setStatus('Unlock failed: ' + err.message)
    }
  }

  // After keys are unlocked, determine role (initiator vs responder) based on inbox and local sessions
  useEffect(() => {
    if (!keysUnlocked) return

    // clear transient session role state to avoid stale buttons when switching targets
    setSessionExists(false)
    setIncomingInitExists(false)
    setSessionId(null)
    setSessionEstablished(false)
    setMessages([])

    let cancelled = false
    const decideRole = async () => {
      try {
        // 1) if user already has a local session involving target, set session established
        const keys = await import('../crypto/keys.js')
        const existing = await keys.findSessionByParticipant(targetUsername)
        if (existing && existing.sessionId) {
          if (cancelled) return
          setSessionId(existing.sessionId)
          setSessionExists(true)
          setIncomingInitExists(false)
          setStatus('Local session available — click Continue to resume secure chat')
          return
        }

        // 2) Check inbox for any unhandled SESSION_INIT from the target
        const inboxRes = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
        if (inboxRes && inboxRes.ok) {
          const inboxData = await inboxRes.json()
          const msgs = inboxData.messages || []
          const hasInit = msgs.some(m => m.type === 'SESSION_INIT' && m.payload && m.payload.from === targetUsername)
          if (hasInit) {
            setIncomingInitExists(true)
            setSessionExists(false)
            setStatus('Incoming secure request from @' + targetUsername)
            return
          }
        }

        // Default: no pending init and no local session → initiator role
        setIncomingInitExists(false)
        setSessionExists(false)
        setStatus('No incoming requests. You can start a secure conversation.')
      } catch (e) {
        setStatus('Role detection error: ' + e.message)
      }
    }

    decideRole()
    return () => { cancelled = true }
  }, [keysUnlocked, targetUsername])

  // Light polling to update incoming requests presence until a session is established
  useEffect(() => {
    if (!keysUnlocked) return
    if (sessionEstablished || sessionExists) return
    let active = true
    const tick = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        const msgs = (data.messages || []).filter(m => m.type === 'SESSION_INIT' && m.payload && m.payload.from === targetUsername)
        setIncomingList(msgs.map(m => ({ id: m._id, from: m.payload.from, timestamp: m.payload.timestamp })))
        const hasInit = msgs.length > 0
        setIncomingInitExists(hasInit)
      } catch {}
    }
    const id = setInterval(tick, 3000)
    tick()
    return () => { active = false; clearInterval(id) }
  }, [keysUnlocked, sessionEstablished, sessionExists, targetUsername])

  // Send message
  const sendMessage = async () => {
    if (!sessionEstablished || !sessionId) return setStatus('No secure session established')
    if (!newMsg) return
    try {
      const { sendMessage: sendMsg } = await import('../session/messages.js')
      await sendMsg({ apiUrl, token, sessionId, passphrase, plaintext: newMsg, senderUsername: user.username })
      setStatus('Message sent')
      setNewMsg('')
    } catch (err) {
      setStatus('Send error: ' + err.message)
    }
  }

  // Refresh messages (polling)
  const refreshMessages = async () => {
    if (!sessionEstablished || !sessionId) return setStatus('No secure session established')
    try {
      const { fetchAndDecrypt } = await import('../session/messages.js')
      const res = await fetchAndDecrypt({ apiUrl, token, sessionId, passphrase })
      setMessages(res)
      setStatus('Fetched ' + res.length + ' messages')
    } catch (err) {
      setStatus('Fetch error: ' + err.message)
    }
  }

  return (
    <MainLayout>
      <div className="card">
        <h2>Chat with @{targetUsername}</h2>
      </div>

      <div className="card">
        <h3>Step 1 — Unlock your secure keys</h3>
        <div className="form-row">
          <label>Local passphrase</label>
          <input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={unlockKeys}>Unlock keys</button>
        </div>
        <div style={{ marginTop: 8 }}>
          {!keysUnlocked && <div className="small">Keys locked — enter your passphrase to continue.</div>}
          {keysUnlocked && <div className="small">Keys unlocked. You may now establish a secure session.</div>}
        </div>
      </div>

      <div className="card" style={{ display: keysUnlocked ? 'block' : 'none' }}>
        <h3>Step 2 — Establish secure session</h3>
        <div className="small">After unlocking, the client will start a secure session with @{targetUsername} using REST.</div>
        <div style={{ marginTop: 8 }}>
          {(!sessionExists && !incomingInitExists) && (
            <button className="btn" onClick={async () => {
              // Prevent double-init: re-check local session and inbox before creating a new init
              setStatus('Preparing to start secure conversation...')
              // clear any transient incoming flag before initiating
              setIncomingInitExists(false)
              // allow composing while waiting for responder to accept
              setCanCompose(true)
              try {
                const keys = await import('../crypto/keys.js')
                const existing = await keys.findSessionByParticipant(targetUsername)
                if (existing && existing.sessionId) {
                  setSessionId(existing.sessionId)
                  setSessionEstablished(true)
                  setStatus('Local session already exists')
                  setCanCompose(true)
                  return
                }
                // check inbox for a fresh peer INIT that arrived between checks
                try {
                  const peerInit = await sm.checkInboxForPeerInit(apiUrl, token, targetUsername)
                  if (peerInit) {
                    // handle as responder instead of initiating
                    const handled = await sm.handleIncomingInit(apiUrl, token, peerInit, user.id, user.username, passphrase)
                    await fetch(`${apiUrl}/api/sessions/consume/${peerInit._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                    setSessionId(handled.sessionId)
                    setSessionEstablished(true)
                    setIncomingInitExists(false)
                    setStatus('Handled incoming request; session ready')
                    setCanCompose(true)
                    return
                  }
                } catch (e) {
                  // inbox check failed; continue to initiating
                }

                // safe to initiate
                const res = await sm.startSession({ apiUrl, token, myUserId: user.id, myUsername: user.username, passphrase, targetUsername })
                setSessionId(res.sessionId)
                setSessionEstablished(true)
                setStatus('Secure session established')
                setCanCompose(true)
              } catch (e) {
                setStatus('Start error: ' + e.message)
              }
            }}>Start secure conversation</button>
          )}

          {sessionExists && (
            <>
              <button className="btn" style={{ marginLeft: 8 }} onClick={() => {
                setSessionEstablished(true)
                setCanCompose(true)
                setStatus('Resumed local session')
              }}>Continue secure chat</button>
              <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
                try {
                  const keys = await import('../crypto/keys.js')
                  // Delete the existing local session and clear local flags
                  if (sessionId) await keys.deleteSession(sessionId)
                  setSessionId(null)
                  setSessionExists(false)
                  setSessionEstablished(false)
                  setIncomingInitExists(false)
                  setMessages([])
                  setCanCompose(true)
                  setStatus('Old session cancelled. Starting a new secure conversation...')
                  // Immediately follow initiator path: call startSession
                  try {
                    const res = await sm.startSession({ apiUrl, token, myUserId: user.id, myUsername: user.username, passphrase, targetUsername })
                    setSessionId(res.sessionId)
                    setSessionEstablished(true)
                    setStatus('Secure session established')
                  } catch (e) {
                    setStatus('Start error: ' + e.message)
                  }
                } catch (e) {
                  setStatus('Cancel error: ' + e.message)
                }
              }}>Cancel old session & start new</button>
            </>
          )}

          {incomingInitExists && (
              <>
                <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
                  setStatus('Handling incoming request...')
                  try {
                    const handled = await sm.checkAndHandleInboxOnce(apiUrl, token, user.id, user.username, passphrase, targetUsername)
                    if (handled) {
                      setSessionId(handled.sessionId)
                      setSessionEstablished(true)
                      setCanCompose(true)
                      setStatus('Handled incoming request; session ready')
                    } else {
                      setStatus('No incoming requests found to accept')
                    }
                  } catch (e) {
                    setStatus('Inbox error: ' + e.message)
                  }
                }}>Accept incoming request</button>
                <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
                  // Reject incoming: consume any INIT from target without establishing, then start a fresh session
                  setStatus('Rejecting incoming request and starting a new session...')
                  try {
                    const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
                    if (res && res.ok) {
                      const data = await res.json()
                      const msgs = (data.messages || []).filter(m => m.type === 'SESSION_INIT' && m.payload && m.payload.from === targetUsername)
                      for (const m of msgs) {
                        await fetch(`${apiUrl}/api/sessions/consume/${m._id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                      }
                    }
                    setIncomingInitExists(false)
                    setSessionExists(false)
                    setSessionId(null)
                    setSessionEstablished(false)
                    setMessages([])
                    setCanCompose(true)
                    // Initiate new session
                    try {
                      const res2 = await sm.startSession({ apiUrl, token, myUserId: user.id, myUsername: user.username, passphrase, targetUsername })
                      setSessionId(res2.sessionId)
                      setSessionEstablished(true)
                      setStatus('Secure session established')
                    } catch (e) {
                      setStatus('Start error: ' + e.message)
                    }
                  } catch (e) {
                    setStatus('Reject error: ' + e.message)
                  }
                }}>Reject & start new</button>
              </>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="small">Status: <em>{status}</em></div>
          {(!sessionExists && !sessionEstablished) && (
            <div className="small" style={{ marginTop: 6 }}>
              Listening for incoming requests from @{targetUsername}...
              <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
                try {
                  const res = await fetch(`${apiUrl}/api/sessions/inbox`, { headers: { Authorization: `Bearer ${token}` } })
                  if (res && res.ok) {
                    const data = await res.json()
                    const msgs = (data.messages || []).filter(m => m.type === 'SESSION_INIT' && m.payload && m.payload.from === targetUsername)
                    setIncomingList(msgs.map(m => ({ id: m._id, from: m.payload.from, timestamp: m.payload.timestamp })))
                    const hasInit = msgs.length > 0
                    setIncomingInitExists(hasInit)
                    setStatus(hasInit ? 'Incoming secure request detected' : 'No incoming requests')
                  }
                } catch (e) {
                  setStatus('Incoming refresh error: ' + e.message)
                }
              }}>Refresh incoming</button>
              {incomingList.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="small">Incoming requests:</div>
                  {incomingList.map(item => (
                    <div key={item.id} className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <span>From @{item.from} at {item.timestamp}</span>
                      <button className="btn" onClick={async () => {
                        setStatus('Accepting request ' + item.id + '...')
                        try {
                          const handled = await sm.acceptInitById(apiUrl, token, item.id, user.id, user.username, passphrase)
                          if (handled) {
                            setSessionId(handled.sessionId)
                            setSessionEstablished(true)
                            setCanCompose(true)
                            setIncomingInitExists(false)
                            setIncomingList([])
                            setStatus('Handled incoming request; session ready')
                          } else {
                            setStatus('Request no longer available')
                          }
                        } catch (e) {
                          setStatus('Accept error: ' + e.message)
                        }
                      }}>Accept</button>
                      <button className="btn" onClick={async () => {
                        setStatus('Rejecting request ' + item.id + '...')
                        try {
                          await fetch(`${apiUrl}/api/sessions/consume/${item.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                          setIncomingList(list => list.filter(x => x.id !== item.id))
                          const stillHas = incomingList.length - 1 > 0
                          setIncomingInitExists(stillHas)
                        } catch (e) {
                          setStatus('Reject error: ' + e.message)
                        }
                      }}>Reject</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ display: (sessionEstablished || (keysUnlocked && canCompose)) ? 'block' : 'none' }}>
        <h3>Step 3 — Secure chat</h3>
        <div className="form-row">
          <label>Message</label>
          <textarea rows={3} value={newMsg} onChange={e => setNewMsg(e.target.value)} style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <div style={{ marginTop: 6 }}>
            <button className="btn" onClick={sendMessage} disabled={!sessionEstablished}>Send message</button>
            {sessionEstablished && (
              <button className="btn" onClick={refreshMessages} style={{ marginLeft: 8 }}>Refresh messages</button>
            )}
          </div>
        </div>

        {!sessionEstablished && (
          <div className="small" style={{ marginTop: 6 }}>
            Waiting for recipient to accept the secure session. You can compose your message now; sending will enable once the session is established.
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {messages.map(m => (
            <div key={m.id} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
              <strong>{m.sender}</strong> <small>{m.timestamp}</small>
              <div>{m.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <pre style={{ whiteSpace: 'pre-wrap' }}>{status}</pre>
      </div>
    </MainLayout>
  )
}
