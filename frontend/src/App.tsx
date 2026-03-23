import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import FloorPage from './pages/FloorPage'
import OrderPage from './pages/OrderPage'
import BillingPage from './pages/BillingPage'
import AdminPage from './pages/AdminPage'

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/floor" replace />} />
        <Route path="/floor" element={<FloorPage />} />
        <Route path="/order" element={<OrderPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}

export default App
