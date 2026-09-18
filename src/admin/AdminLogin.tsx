import { useEffect, useState, type FormEvent } from 'react'
import { adminToken, api } from '../lib/http'
import { errMsg } from './lib'

export default function AdminLogin({ onDone }: { onDone: () => void }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = () => {
    setCheckError(null)
    setNeedsSetup(null)
    void api.get<{ needsSetup: boolean }>('/api/admin/status', null).then((s) => setNeedsSetup(s.needsSetup)).catch((e) => setCheckError(errMsg(e)))
  }
  useEffect(check, [])

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
      {checkError && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          <p className="font-semibold text-red-800">Cannot reach the server.</p>
          <p className="break-words text-red-800">{checkError}</p>
          <p className="mt-1 text-gray-700">Open <a className="underline" href="/api/health" target="_blank" rel="noreferrer">/api/health</a> to see what is missing (database URL, secret, photo store).</p>
          <button type="button" className="a-btn-plain mt-2" onClick={check}>Try again</button>
        </div>
      )}
      {!checkError && needsSetup === null && <p className="text-sm text-gray-600">Connecting to server…</p>}
      {needsSetup && <p className="rounded bg-blue-50 p-2 text-sm">No admin account yet. Create the first one now. This form disappears afterwards.</p>}
      <input className="a-input" type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="a-input" type="password" placeholder={needsSetup ? 'Password (8+ characters)' : 'Password'} autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-red-700">{error}</p>}
      <button className="a-btn" disabled={busy || needsSetup === null}>{needsSetup ? 'Create admin account' : 'Sign in'}</button>
    </form>
  )
}
