import React, { createContext, useContext, useEffect, useState } from 'react'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('authToken') || '')
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(async r => {
        if (r.ok) {
          const data = await r.json()
          setUser(data.user)
        }
      }).catch(() => {})
    }
  }, [token])

  const login = (tok, usr) => {
    localStorage.setItem('authToken', tok)
    setToken(tok)
    setUser(usr)
  }
  const logout = () => {
    localStorage.removeItem('authToken')
    setToken('')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
