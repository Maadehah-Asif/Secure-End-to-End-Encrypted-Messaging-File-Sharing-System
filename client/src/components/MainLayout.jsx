import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/forms.css'

export default function MainLayout({ children }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()

  const doLogout = () => {
    logout()
    nav('/login')
  }

  return (
    <div>
      <nav className="top-nav">
        <div className="nav-left">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
        </div>
        <div className="nav-right">
          {user ? (
            <>
              <span className="small">{user.username}</span>
              <button className="btn" onClick={doLogout}>Logout</button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </nav>

      <main className="app-container">
        {children}
      </main>
    </div>
  )
}
