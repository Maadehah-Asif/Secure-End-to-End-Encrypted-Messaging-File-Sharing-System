import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import '../styles/forms.css'
import homeIcon from '../assets/icons/home.png'
import contactsIcon from '../assets/icons/contacts.png'

export default function MainLayout({ children, fullWidth = false }) {
  const { user, logout } = useAuth()
  const nav = useNavigate()

  const doLogout = () => {
    logout()
    nav('/login')
  }

  return (
    <div>
      <nav className="top-nav">
        <div className="nav-left"><Link to="/" className="icon-link"><span className="nav-title">CipherLink</span></Link></div>
        <div className="nav-icons">
          <Link to="/dashboard" title="Home" className="icon-link"><img className="icon" src={homeIcon} alt="home" /></Link>
          <Link to="/contacts" title="Contacts" className="icon-link"><img className="icon" src={contactsIcon} alt="contacts" /></Link>
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

      <main
        className="app-container"
        style={{
          maxWidth: fullWidth ? '100%' : '1200px',
          margin: fullWidth ? 0 : '0 auto',
          padding: fullWidth ? 0 : '16px'
        }}
      >
        {children}
      </main>
    </div>
  )
}
