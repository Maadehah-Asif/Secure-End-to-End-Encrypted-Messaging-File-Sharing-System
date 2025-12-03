import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/forms.css'
import illustration from '../assets/login-signup-image.png'
import AuthLayout from '../components/AuthLayout.jsx'

export default function LoginPage() {
  const [imageSrc, setImageSrc] = useState(null)

  useEffect(() => {
    const candidates = [
      'login-signup image.png',
      'auth-illustration.png',
      'login-signup-image.png',
      'login-signup.png'
    ]
    ;(async () => {
      // If we have a static import available, prefer it and skip runtime probes
      if (typeof illustration === 'string' && illustration) return

      const bases = ['/src/assets', '/assets', '']
      for (const name of candidates) {
        for (const base of bases) {
          const path = base ? `${base}/${encodeURIComponent(name)}` : `/${encodeURIComponent(name)}`
          try {
            const r = await fetch(path, { method: 'GET' })
            if (r.ok) {
              setImageSrc(path)
              return
            }
          } catch (err) {
            // ignore and try next
          }
        }
      }
      setImageSrc(defaultPlaceholder())
    })()
  }, [])
  function defaultPlaceholder() {
    // simple inline SVG data URL as fallback
    const svg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%23f8fafc'/><g fill='%238ca0b7'><rect x='40' y='40' width='320' height='220' rx='12'/></g><g fill='%23fff'><rect x='70' y='70' width='260' height='160' rx='8'/><circle cx='120' cy='120' r='10' fill='%23eab308'/></g></svg>`)
    return `data:image/svg+xml;utf8,${svg}`
  }
  const [principal, setPrincipal] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const nav = useNavigate()
  const { login } = useAuth()

  const submit = async (e) => {
    e.preventDefault()
    setErrors({})
    if (!principal.trim()) return setErrors({ principal: 'Username or email required' })
    if (!password) return setErrors({ password: 'Password required' })

    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUsername: principal, password })
    })
    const data = await res.json().catch(() => ({ error: 'Server error' }))
    if (res.ok) {
      login(data.token, data.user)
      nav('/dashboard')
    } else {
      setErrors({ server: data.error || 'Login failed' })
    }
  }

  return (
    <AuthLayout title="Login" image={imageSrc || illustration || defaultPlaceholder()}>
      <form onSubmit={submit} className="auth-form">
        <div className="form-row">
          <label>Username or Email</label>
          <input value={principal} onChange={e => setPrincipal(e.target.value)} />
          {errors.principal && <div className="error">{errors.principal}</div>}
        </div>

        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          {errors.password && <div className="error">{errors.password}</div>}
        </div>

        <div className="form-actions">
          <button className="btn" type="submit">Login</button>
          <div style={{ alignSelf: 'center' }}>
            <Link className="link" to="/register">Create account</Link>
          </div>
        </div>
        {errors.server && <div className="error" style={{ marginTop: 10 }}>{errors.server}</div>}
      </form>
    </AuthLayout>
  )
}
