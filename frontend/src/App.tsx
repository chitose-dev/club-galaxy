import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { useStore } from './store'
import Layout from './components/Layout'
import ErrorBoundary from './utils/ErrorBoundary'
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
import ExtensionConfirmPage from './pages/ExtensionConfirmPage'

function AuthGuard({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!allowedRoles.includes(user.role)) {
    // cast は /top にアクセスできないので /salary にフォールバック
    const fallback = user.role === 'cast' ? '/salary' : '/top'
    return <Navigate to={fallback} replace />
  }
  return <>{children}</>
}

function App() {
  const { user } = useAuth()
  const { fetchFailed, loading } = useStore()
  const navigate = useNavigate()

  // 起動時 fetch 中はフルスクリーン「読み込み中...」（キャッシュがあれば下のルートでも
  // 即時表示は可能だが、画面ちらつき・データ未確定の操作を避けるためここで待つ）
  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-gray-400 text-sm">読み込み中...</div>
        </div>
      </div>
    )
  }

  // 起動時 fetch が完了していて主要 endpoint が全件失敗した場合のみエラー画面
  if (fetchFailed) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-red-400 mb-3">サーバーとの接続に失敗しました</h1>
          <p className="text-gray-400 text-sm mb-6">
            ページを再読み込みしてください。<br />
            復旧しない場合は管理者へ連絡してください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-white text-black rounded-lg font-bold"
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }

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
      {/* ページ render の例外を捕捉してアプリ全体のアンマウントを防ぐ。
          フォールバック UI からは「ホールへ戻る」で /floor に戻り state リセット。 */}
      <Route element={<ErrorBoundary onReset={() => navigate('/floor')}><Layout /></ErrorBoundary>}>
        <Route path="/" element={<Navigate to={defaultRoute} replace />} />
        <Route path="/top" element={<AuthGuard allowedRoles={['owner', 'staff']}><TopPage /></AuthGuard>} />
        <Route path="/floor" element={<AuthGuard allowedRoles={['owner', 'staff']}><FloorPage /></AuthGuard>} />
        <Route path="/waiting" element={<AuthGuard allowedRoles={['owner', 'staff']}><WaitingCastPage /></AuthGuard>} />
        <Route path="/order" element={<AuthGuard allowedRoles={['owner', 'staff']}><OrderPage /></AuthGuard>} />
        <Route path="/table/:id" element={<AuthGuard allowedRoles={['owner', 'staff']}><UsageDetailPage /></AuthGuard>} />
        <Route path="/table/:id/extend" element={<AuthGuard allowedRoles={['owner', 'staff']}><ExtensionConfirmPage /></AuthGuard>} />
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
