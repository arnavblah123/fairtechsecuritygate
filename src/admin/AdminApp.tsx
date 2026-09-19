import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { adminToken } from '../lib/http'
import { admin } from './lib'
import AdminLogin from './AdminLogin'
import Labourers from './Labourers'
import Contractors from './Contractors'
import Guards from './Guards'
import Devices from './Devices'
import Live from './Live'
import Companies from './Companies'
import Import from './Import'
import Staff from './Staff'

export default function AdminApp() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')
  const [email, setEmail] = useState('')

  const check = async () => {
    if (!adminToken.get()) { setState('out'); return }
    try {
      const me = await admin.get<{ email: string }>('/api/admin/me')
      setEmail(me.email)
      setState('in')
    } catch {
      adminToken.set(null)
      setState('out')
    }
  }
  useEffect(() => { void check() }, [])

  if (state === 'loading') return <p className="p-4">Loading…</p>
  if (state === 'out') return <AdminLogin onDone={() => void check()} />

  const signOut = () => { adminToken.set(null); setState('out') }
  const link = ({ isActive }: { isActive: boolean }) => `rounded px-3 py-1 ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-gray-200'}`
  return (
    <div className="mx-auto max-w-6xl p-3 text-base">
      <nav className="mb-4 flex flex-wrap items-center gap-2 border-b pb-2">
        <span className="mr-2 font-bold">Fairtech Gate · Admin</span>
        <NavLink to="/admin" end className={link}>Live</NavLink>
        <NavLink to="/admin/labourers" className={link}>Labourers</NavLink>
        <NavLink to="/admin/contractors" className={link}>Contractors</NavLink>
        <NavLink to="/admin/guards" className={link}>Guards & PINs</NavLink>
        <NavLink to="/admin/staff" className={link}>Staff</NavLink>
        <NavLink to="/admin/companies" className={link}>Companies</NavLink>
        <NavLink to="/admin/devices" className={link}>Devices</NavLink>
        <NavLink to="/admin/import" className={link}>Import</NavLink>
        <span className="flex-1" />
        <span className="text-sm text-gray-600">{email}</span>
        <button type="button" className="a-btn-plain" onClick={signOut}>Sign out</button>
      </nav>
      <Routes>
        <Route index element={<Live />} />
        <Route path="labourers" element={<Labourers />} />
        <Route path="contractors" element={<Contractors />} />
        <Route path="guards" element={<Guards />} />
        <Route path="devices" element={<Devices />} />
        <Route path="staff" element={<Staff />} />
        <Route path="companies" element={<Companies />} />
        <Route path="import" element={<Import />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  )
}
