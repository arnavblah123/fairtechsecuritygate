import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { I18nProvider } from './lib/i18n'
import GuardApp from './guard/GuardApp'

const AdminApp = lazy(() => import('./admin/AdminApp'))

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<p className="p-4">Loading…</p>}><AdminApp /></Suspense>} />
      <Route path="/*" element={<I18nProvider><GuardApp /></I18nProvider>} />
    </Routes>
  )
}
