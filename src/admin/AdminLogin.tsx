import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto mt-16 flex max-w-sm flex-col gap-3 p-4">
      <h1 className="text-xl font-bold">Fairtech Gate · Admin</h1>
      <input className="a-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="a-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-red-700">{error}</p>}
      <button className="a-btn" disabled={busy}>Sign in</button>
    </form>
  )
}
