import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import LangToggle from '../components/LangToggle'
import { useT } from '../lib/i18n'
import { setGuardSession } from '../lib/session'
import { guardToken } from '../lib/http'
import { useOnline, usePendingCount } from '../lib/sync'
import { fmtTime } from '../lib/time'
import { useGuard } from './GuardApp'
import { useLabourInside, useTodayEntries, useVehiclesInside, useVisitorsInside } from './inside'

export default function Home() {
  const { t, lang } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const online = useOnline()
  const pending = usePendingCount()
  const labourInside = useLabourInside()
  const visitorsInside = useVisitorsInside()
  const vehiclesInside = useVehiclesInside()
  const entries = useTodayEntries(lang, t)
  const [menu, setMenu] = useState(false)

  const people = labourInside.size + visitorsInside.reduce((n, v) => n + (v.persons || 1), 0)

  const logout = () => {
    if (!confirm(t('logout_confirm'))) return
    setGuardSession(null)
    guardToken.set(null)
    nav('/login', { replace: true })
  }

  return (
    <div className="min-h-screen pb-6">
      <header className="flex items-center justify-between border-b-2 border-gray-200 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{s.unitName}</div>
          <div className="truncate text-sm text-gray-600">{t('guard')}: {s.guardName}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/sync" className={`badge ${pending > 0 ? 'bg-orange-100 text-orange-800' : online ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
            {pending > 0 ? t('pending_count', { n: pending }) : online ? t('all_synced') : t('offline')}
          </Link>
          <button type="button" aria-label={t('menu')} onClick={() => setMenu(true)} className="flex h-14 w-14 items-center justify-center rounded-xl text-3xl active:bg-gray-100">⋯</button>
        </div>
      </header>

      <section className="mx-3 mt-3 rounded-2xl bg-blue-50 p-3 text-center">
        <div className="text-base font-semibold text-blue-900">{t('inside_now')}</div>
        <div className="text-2xl font-bold text-blue-900">
          {people} {t('people')} · {vehiclesInside.length} {t('vehicles')}
        </div>
      </section>

      <section className="mx-3 mt-3 grid gap-3">
        <BigButton size="xl" icon="👷" onClick={() => nav('/labour')}>{t('labour')}</BigButton>
        <BigButton size="xl" icon="🧑‍💼" onClick={() => nav('/visitor')}>{t('visitor')}</BigButton>
        <BigButton size="xl" icon="🚚" onClick={() => nav('/vehicle')}>{t('vehicle')}</BigButton>
        <BigButton size="xl" icon="🚨" variant="danger" onClick={() => nav('/emergency')}>{t('emergency')}</BigButton>
      </section>

      <section className="mx-3 mt-5">
        <h2 className="mb-2 text-xl font-bold">{t('today_entries')}</h2>
        {entries.length === 0 && <p className="text-gray-500">{t('no_entries')}</p>}
        <ul className="grid gap-2">
          {entries.map((e) => (
            <li key={e.key} className="min-w-0">
              <Link to={`/entry/${e.register}/${e.id}`} className={`card flex items-center gap-3 p-2 ${e.voided ? 'opacity-60' : ''}`}>
                <Photo path={e.photo} keep={e.keepPhoto} className="thumb" />
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-lg font-semibold ${e.register === 'vehicle' ? 'font-mono tracking-wider' : ''} ${e.voided ? 'line-through' : ''}`}>{e.title}</div>
                  <div className="truncate text-sm text-gray-600">
                    {fmtTime(e.at)}
                    {e.register !== 'labour' ? ` · ${t(e.register)}` : ''}
                    {e.subtitle ? ` · ${e.subtitle}` : ''}
                    {e.pending ? ` · ${t('pending_send')}` : ''}
                    {e.mistake ? ` · ${t('mistake_reported')}` : ''}
                    {e.voided ? ` · ${t('voided')}` : ''}
                  </div>
                </div>
                <span className={`badge shrink-0 whitespace-nowrap text-base ${e.direction === 'in' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{e.direction === 'in' ? t('in') : t('out')}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {menu && (
        <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/50" onClick={() => setMenu(false)}>
          <div className="rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 grid gap-3">
              <BigButton variant="plain" icon="🔁" onClick={() => alert(t('coming_soon'))}>{t('handover')}</BigButton>
              <BigButton variant="plain" icon="⚠️" onClick={() => alert(t('coming_soon'))}>{t('incident')}</BigButton>
              <BigButton variant="plain" icon="📤" onClick={() => nav('/sync')}>{t('sync_status')}</BigButton>
            </div>
            <div className="mb-1 text-sm font-semibold text-gray-600">{t('language')}</div>
            <LangToggle />
            <div className="mt-3 grid gap-3">
              <BigButton variant="danger" icon="🚪" onClick={logout}>{t('logout')}</BigButton>
              <BigButton variant="plain" onClick={() => setMenu(false)}>{t('close')}</BigButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
