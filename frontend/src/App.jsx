import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projet from './pages/Projet'
import Upload from './pages/Upload'
import Chat from './pages/Chat'
import Historique from './pages/Historique'
import Visas from './pages/Visas'
import Users from './pages/Users'
import Syntheses from './pages/Syntheses'
import Reglementation from './pages/Reglementation'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
      <Route path="/projets/:id" element={<PrivateRoute><Projet /></PrivateRoute>} />
      <Route path="/projets/:id/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
      <Route path="/projets/:id/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
      <Route path="/projets/:id/historique" element={<PrivateRoute><Historique /></PrivateRoute>} />
      <Route path="/projets/:id/visas" element={<PrivateRoute><Visas /></PrivateRoute>} />
      <Route path="/projets/:id/syntheses" element={<PrivateRoute><Syntheses /></PrivateRoute>} />
      <Route path="/reglementation" element={<AdminRoute><Reglementation /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
