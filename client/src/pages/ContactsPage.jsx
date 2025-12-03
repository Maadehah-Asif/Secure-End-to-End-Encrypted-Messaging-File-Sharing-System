import React, { useEffect, useState } from 'react'
import MainLayout from '../components/MainLayout.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/forms.css'
import { useNavigate } from 'react-router-dom'

function initials(fullName) {
  if (!fullName) return ''
  return fullName.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase()
}

export default function ContactsPage() {
  const { token } = useAuth()
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [filtered, setFiltered] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    const api = import.meta.env.VITE_API_URL || 'http://localhost:4000'
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`${api}/api/users`, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const data = await res.json()
        setUsers(data.users || [])
      } catch (e) {
        console.error('contacts fetch error', e)
      }
    })()
  }, [token])

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) return setFiltered(users)
    setFiltered(users.filter(u => (u.username && u.username.toLowerCase().includes(q)) || (u.fullName && u.fullName.toLowerCase().includes(q))))
  }, [query, users])

  useEffect(() => { setFiltered(users) }, [users])

  const openConversation = (username) => {
    navigate(`/conversation/${encodeURIComponent(username)}`)
  }

  return (
    <MainLayout>
      <div className="card">
        <h2>Contacts</h2>
        <div className="form-row">
          <input placeholder="Search by name or username" value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          {filtered.length === 0 && <div className="small">No contacts found.</div>}
          {filtered.map(u => (
            <div key={u.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => openConversation(u.username)}>
              <div style={{ width:48, height:48, borderRadius:24, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
                <strong style={{ color:'#FF7379' }}>{initials(u.fullName)}</strong>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600 }}>{u.fullName}</div>
                <div style={{ color:'#6b7280' }}>@{u.username}</div>
              </div>
              <div>
                <button className="btn" onClick={(e)=>{ e.stopPropagation(); openConversation(u.username) }}>Start Conversation</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  )
}
