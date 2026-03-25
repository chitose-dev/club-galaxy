import { useState } from 'react'
import { useAuth } from '../auth'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const success = login(username, pin)
    if (!success) {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="min-h-dvh bg-[#1a1a2e] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-[#d4af37] text-center mb-2 tracking-wider">CLUB GALAXY</h1>
        <p className="text-center text-gray-400 text-sm mb-8">ログイン</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">ユーザー名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ユーザー名を入力"
              className="w-full bg-white/10 border border-gray-600 rounded-lg px-4 py-3 text-sm focus:border-[#d4af37] outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">PINコード</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PINコードを入力"
              className="w-full bg-white/10 border border-gray-600 rounded-lg px-4 py-3 text-sm focus:border-[#d4af37] outline-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">ユーザー名またはPINコードが正しくありません</p>
          )}

          <button
            type="submit"
            className="w-full bg-[#e94560] py-4 rounded-xl text-lg font-bold active:bg-[#c73550] transition-colors"
          >
            ログイン
          </button>
        </form>

        <div className="mt-8 bg-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 mb-2">デモアカウント:</p>
          <div className="space-y-1 text-xs text-gray-500">
            <div>オーナー: owner / 1234</div>
            <div>黒服: staff / 5678</div>
            <div>キャスト(あいり): cast1 / 1111</div>
            <div>キャスト(みく): cast2 / 2222</div>
          </div>
        </div>
      </div>
    </div>
  )
}
