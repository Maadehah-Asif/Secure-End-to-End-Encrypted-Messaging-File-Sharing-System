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
      <button onClick={() => nav('/')} className="back-button" style={{ marginBottom: 8 }}>
        ← Back
      </button>
      <div className="card">
        <h2>Dashboard</h2>
        {me && (
          <div>
            <p className="small">Welcome, <strong>{me.fullName}</strong> ({me.username})</p>
            <p className="small">Email: {me.email}</p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Step 1 — Generate and unlock your keys</h3>
        <p className="small">After your keys are ready, proceed to Contacts to start a secure chat.</p>
        <div style={{ marginTop: 8 }}>
          <Link to="/contacts"><button className="btn">Proceed to Contacts</button></Link>
        </div>
      </div>

      <KeyManager />
    </MainLayout>
  )
}
