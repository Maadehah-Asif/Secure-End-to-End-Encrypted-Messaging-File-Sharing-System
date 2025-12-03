import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import KeyManager from '../components/KeyManager.jsx'
import { useNavigate } from 'react-router-dom'
import MainLayout from '../components/MainLayout.jsx'
import { Link } from 'react-router-dom'
import '../styles/forms.css'

export default function DashboardPage() {
  const { token, user } = useAuth()
  const [me, setMe] = useState(null)
  const [targetUser, setTargetUser] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    (async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMe(data.user)
      }
    })()
  }, [token])

  const openConversation = () => {
    if (!targetUser) return
    nav(`/conversation/${encodeURIComponent(targetUser)}`)
  }

  return (
    <MainLayout>
      <div className="card">
        <h2>Dashboard</h2>
        <div style={{ marginTop: 8 }}>
          <Link to="/contacts"><button className="btn" style={{ background:'#47727F' }}>Contacts</button></Link>
        </div>
        {me && (
          <div>
            <p className="small">Welcome, <strong>{me.fullName}</strong> ({me.username})</p>
            <p className="small">Email: {me.email}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Secure Messaging</h3>
        <div className="form-row">
          <label>Target username</label>
          <input value={targetUser} onChange={e => setTargetUser(e.target.value)} />
        </div>
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={openConversation}>Open Conversation</button>
        </div>
      </div>

      <KeyManager />
    </MainLayout>
  )
}
