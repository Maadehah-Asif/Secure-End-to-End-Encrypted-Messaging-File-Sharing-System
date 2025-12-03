import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/forms.css'
import illustration from '../assets/login-signup-image.png'
import AuthLayout from '../components/AuthLayout.jsx'
export default function RegisterPage() {
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
            // try fetching candidate path
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
    const svg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='100%' height='100%' fill='%23f8fafc'/><g fill='%238ca0b7'><rect x='40' y='40' width='320' height='220' rx='12'/></g><g fill='%23fff'><rect x='70' y='70' width='260' height='160' rx='8'/><circle cx='120' cy='120' r='10' fill='%23eab308'/></g></svg>`)
    return `data:image/svg+xml;utf8,${svg}`
  }
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [statusMsg, setStatusMsg] = useState('')

  function validateClient() {
    const e = {}
    if (!fullName.trim()) e.fullName = 'Full name is required'
    if (!email.trim()) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format'
    if (!username.trim()) e.username = 'Username is required'
    else if (username.length < 3) e.username = 'Username must be at least 3 characters'
    else if (/\s/.test(username) || username !== username.toLowerCase()) e.username = 'Username must be lowercase with no spaces'
    if (!password) e.password = 'Password is required'
    else {
      if (password.length < 8) e.password = 'Password must be at least 8 characters'
      if (!/[A-Z]/.test(password)) e.password = (e.password ? e.password + '; ' : '') + 'include an uppercase letter'
      if (!/[a-z]/.test(password)) e.password = (e.password ? e.password + '; ' : '') + 'include a lowercase letter'
      if (!/[0-9]/.test(password)) e.password = (e.password ? e.password + '; ' : '') + 'include a number'
      if (!/[!@#$%^&*(),.?":{}|<>\[\]\\/;:'`~_+=-]/.test(password)) e.password = (e.password ? e.password + '; ' : '') + 'include a special character'
    }
    if (!confirmPassword) e.confirmPassword = 'Please confirm password'
    else if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match'
    return e
  }

  const submit = async (e) => {
    e.preventDefault()
    setStatusMsg('')
    const clientErrors = validateClient()
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, username, password, confirmPassword })
    })
    const data = await res.json().catch(() => ({ error: 'Server error' }))
    if (res.ok) {
      setStatusMsg('Registered successfully. You may now log in.')
      setErrors({})
    } else {
      setStatusMsg('')
      // display server error in a generic field or map specific errors
      setErrors({ server: data.error || 'Registration failed' })
    }
  }

  return (
    <AuthLayout title="Create account" image={imageSrc || illustration || defaultPlaceholder()}>
      <form onSubmit={submit} className="auth-form">
        <div className="form-row">
          <label>Full name</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
          {errors.fullName && <div className="error">{errors.fullName}</div>}
        </div>

        <div className="form-row">
          <label>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} />
          {errors.email && <div className="error">{errors.email}</div>}
        </div>

        <div className="form-row">
          <label>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} />
          {errors.username && <div className="error">{errors.username}</div>}
        </div>

        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          {errors.password && <div className="error">{errors.password}</div>}
          <div className="small">Minimum 8 chars, upper, lower, number, special char</div>
        </div>

        <div className="form-row">
          <label>Confirm password</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          {errors.confirmPassword && <div className="error">{errors.confirmPassword}</div>}
        </div>

        <div className="form-actions">
          <div>
            <button className="btn" type="submit">Register</button>
          </div>
          <div style={{ alignSelf: 'center' }}>
            <Link className="link" to="/login">Already have an account?</Link>
          </div>
        </div>
        {errors.server && <div className="error" style={{ marginTop: 10 }}>{errors.server}</div>}
        {statusMsg && <div className="success" style={{ marginTop: 10 }}>{statusMsg}</div>}
      </form>
    </AuthLayout>
  )
}
