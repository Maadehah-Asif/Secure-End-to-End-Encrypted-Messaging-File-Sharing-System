import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ConversationPage from './pages/ConversationPage.jsx'
import ContactsPage from './pages/ContactsPage.jsx'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
        <Route path="/conversation/:username" element={<ProtectedRoute><ConversationPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </AuthProvider>
  )
}
