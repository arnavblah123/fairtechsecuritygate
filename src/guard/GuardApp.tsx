import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getGuardSession, getLockedUnit } from '../lib/session'
import { useBackgroundSync } from '../lib/sync'
import type { GuardSession } from '../lib/types'
import UnitSelect from './UnitSelect'
import Login from './Login'
import Home from './Home'
import LabourGrid from './LabourGrid'
import LabourInOut from './LabourInOut'
import NewPerson from './NewPerson'
import EntryDetail from './EntryDetail'
import SyncStatus from './SyncStatus'
import Placeholder from './Placeholder'

const SessionCtx = createContext<GuardSession | null>(null)
export function useGuard(): GuardSession {
  const s = useContext(SessionCtx)
  if (!s) throw new Error('no guard session')
  return s
}

export default function GuardApp() {
  const [session, setSession] = useState<GuardSession | null>(getGuardSession())
  useEffect(() => {
    const h = () => setSession(getGuardSession())
    window.addEventListener('gate:session', h)
    return () => window.removeEventListener('gate:session', h)
  }, [])
  useBackgroundSync(session?.unitId ?? null)
  const loc = useLocation()

  if (!session) {
    const locked = getLockedUnit()
    return (
      <Routes>
        <Route path="/unit" element={<UnitSelect />} />
        <Route path="/login" element={locked ? <Login /> : <Navigate to="/unit" replace />} />
        <Route path="*" element={<Navigate to={locked ? '/login' : '/unit'} replace state={{ from: loc.pathname }} />} />
      </Routes>
    )
  }

  return (
    <SessionCtx.Provider value={session}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/labour" element={<LabourGrid />} />
        <Route path="/labour/new" element={<NewPerson />} />
        <Route path="/labour/:id" element={<LabourInOut />} />
        <Route path="/visitor" element={<Placeholder titleKey="visitor" />} />
        <Route path="/vehicle" element={<Placeholder titleKey="vehicle" />} />
        <Route path="/emergency" element={<Placeholder titleKey="emergency" />} />
        <Route path="/entry/labour/:id" element={<EntryDetail />} />
        <Route path="/sync" element={<SyncStatus />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionCtx.Provider>
  )
}
