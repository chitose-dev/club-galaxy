import { useState } from 'react'
import { useAuth } from '../auth'
import { Field, Input } from '../components/Input'
import { GoldButton } from '../components/Buttons'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return
    setIsLoading(true)
    try {
      const success = await login(username, pin)
      if (!success) {
        setError(true)
        setTimeout(() => setError(false), 2000)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-primary flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1
          className="text-3xl font-semibold text-gold text-center mb-2 tracking-[0.2em]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          CLUB GALAXY
        </h1>
        <div className="h-px bg-gold/60 w-24 mx-auto mb-3" />
        <p className="text-center text-gray-500 text-xs tracking-[0.3em] mb-8 uppercase">Staff Login</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="ユーザー名">
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ユーザー名を入力"
              size="lg"
              autoFocus
              disabled={isLoading}
            />
          </Field>
          <Field label="PINコード">
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PINコードを入力"
              size="lg"
              disabled={isLoading}
            />
          </Field>

          {error && (
            <p className="text-accent text-sm text-center">ユーザー名またはPINコードが正しくありません</p>
          )}

          <GoldButton type="submit" className="w-full py-3.5 text-base" disabled={isLoading}>
            {isLoading ? '読み込み中...' : 'ログイン'}
          </GoldButton>
        </form>
      </div>
    </div>
  )
}
