import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TopPage from './pages/TopPage'
import FloorPage from './pages/FloorPage'
import OrderPage from './pages/OrderPage'
import BillingPage from './pages/BillingPage'
import SalaryPage from './pages/SalaryPage'
import RegisterPage from './pages/RegisterPage'
import AdminPage from './pages/AdminPage'
import ProfitPage from './pages/ProfitPage'
import WaitingCastPage from './pages/WaitingCastPage'
import UsageDetailPage from './pages/UsageDetailPage'

function AuthGuard({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) return <Navigate to="/top" replace />
  return <>{children}</>
}

function App() {
  const { user } = useAuth()

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const defaultRoute = user.role === 'cast' ? '/salary' : '/top'

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={defaultRoute} replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/top" element={<AuthGuard allowedRoles={['owner', 'staff', 'cast']}><TopPage /></AuthGuard>} />
        <Route path="/floor" element={<AuthGuard allowedRoles={['owner', 'staff']}><FloorPage /></AuthGuard>} />
        <Route path="/waiting" element={<AuthGuard allowedRoles={['owner', 'staff']}><WaitingCastPage /></AuthGuard>} />
        <Route path="/order" element={<AuthGuard allowedRoles={['owner', 'staff']}><OrderPage /></AuthGuard>} />
        <Route path="/table/:id" element={<AuthGuard allowedRoles={['owner', 'staff']}><UsageDetailPage /></AuthGuard>} />
        <Route path="/billing" element={<AuthGuard allowedRoles={['owner', 'staff']}><BillingPage /></AuthGuard>} />
        <Route path="/salary" element={<AuthGuard allowedRoles={['owner', 'cast']}><SalaryPage /></AuthGuard>} />
        <Route path="/profit" element={<AuthGuard allowedRoles={['owner']}><ProfitPage /></AuthGuard>} />
        <Route path="/register" element={<AuthGuard allowedRoles={['owner']}><RegisterPage /></AuthGuard>} />
        <Route path="/admin" element={<AuthGuard allowedRoles={['owner']}><AdminPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  )
}

export default App
