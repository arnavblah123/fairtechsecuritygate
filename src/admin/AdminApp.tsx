import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AdminLogin from './AdminLogin'
import Labourers from './Labourers'
import Contractors from './Contractors'
import Guards from './Guards'
import Devices from './Devices'
import Live from './Live'

export default function AdminApp() {
  const [state, setState] = useState<'loading' | 'out' | 'notadmin' | 'in'>('loading')

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session || data.session.user.app_metadata?.role === 'guard') { setState('out'); return }
      const { data: row } = await supabase.from('admins').select('user_id').eq('user_id', data.session.user.id).maybeSingle()
      setState(row ? 'in' : 'notadmin')
    }
    void check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void check() })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (state === 'loading') return <p className="p-4">Loading…</p>
  if (state === 'out') return <AdminLogin />
  if (state === 'notadmin') {
    return (
      <div className="p-4">
        <p className="mb-2 text-red-700">This login is not an admin. Add your user id to the <code>admins</code> table (see README).</p>
        <button type="button" className="a-btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </div>
    )
  }

  const link = ({ isActive }: { isActive: boolean }) => `rounded px-3 py-1 ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-gray-200'}`
  return (
    <div className="mx-auto max-w-6xl p-3 text-base">
      <nav className="mb-4 flex flex-wrap items-center gap-2 border-b pb-2">
        <span className="mr-2 font-bold">Fairtech Gate · Admin</span>
        <NavLink to="/admin" end className={link}>Live</NavLink>
        <NavLink to="/admin/labourers" className={link}>Labourers</NavLink>
        <NavLink to="/admin/contractors" className={link}>Contractors</NavLink>
        <NavLink to="/admin/guards" className={link}>Guards & PINs</NavLink>
        <NavLink to="/admin/devices" className={link}>Devices</NavLink>
        <span className="flex-1" />
        <button type="button" className="a-btn-plain" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </nav>
      <Routes>
        <Route index element={<Live />} />
        <Route path="labourers" element={<Labourers />} />
        <Route path="contractors" element={<Contractors />} />
        <Route path="guards" element={<Guards />} />
        <Route path="devices" element={<Devices />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  )
}
