import { useEffect, useState, type FormEvent } from 'react'
import { adminToken, api } from '../lib/http'
import { errMsg } from './lib'

export default function AdminLogin({ onDone }: { onDone: () => void }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.get<{ needsSetup: boolean }>('/api/admin/status', null).then((s) => setNeedsSetup(s.needsSetup)).catch((e) => setError(errMsg(e)))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await api.post<{ token: string }>(needsSetup ? '/api/admin/setup' : '/api/admin/login', { email, password }, null)
      adminToken.set(r.token)
      onDone()
    } catch (err) {
      const code = (err as { code?: string }).code
      setError(code === 'bad_login' ? 'Wrong email or password.' : errMsg(err))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Fairtech Gate · Admin</h1>
      {needsSetup && <p className="rounded bg-blue-50 p-2 text-sm">No admin account yet. Create the first one now. This form disappears afterwards.</p>}
      <input className="a-input" type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="a-input" type="password" placeholder={needsSetup ? 'Password (8+ characters)' : 'Password'} autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-red-700">{error}</p>}
      <button className="a-btn" disabled={busy || needsSetup === null}>{needsSetup ? 'Create admin account' : 'Sign in'}</button>
    </form>
  )
}
