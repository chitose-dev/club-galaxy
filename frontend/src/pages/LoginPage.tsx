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
    <div className="min-h-dvh bg-(--color-primary) flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold text-(--color-gold) text-center mb-2 tracking-[0.2em] font-(family-name:--font-display)">
          CLUB GALAXY
        </h1>
        <p className="text-center text-gray-500 text-sm mb-8">スタッフログイン</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 block mb-1">ユーザー名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ユーザー名を入力"
              className="w-full bg-white/10 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-(--color-gold) outline-none"
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
              className="w-full bg-white/10 border border-white/10 rounded-lg px-4 py-3 text-sm focus:border-(--color-gold) outline-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">ユーザー名またはPINコードが正しくありません</p>
          )}

          <button
            type="submit"
            className="w-full bg-(--color-gold) text-black py-4 rounded-lg text-base font-bold active:opacity-80 transition-opacity"
          >
            ログイン
          </button>
        </form>

        <div className="mt-10 text-center">
          <p className="text-xs text-gray-600 mb-1">デモアカウント:</p>
          <p className="text-xs text-gray-600">owner / 1234 ・ staff / 5678 ・ cast1 / 1111 ・ cast2 / 2222</p>
        </div>
      </div>
    </div>
  )
}
