import { Link, useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { useT } from '../lib/i18n'
import { fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { useVisitorsInside } from './inside'

export default function VisitorHome() {
  const { t } = useT()
  const nav = useNavigate()
  const inside = useVisitorsInside()
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('visitor')} onBack={() => nav('/')} />
      <div className="p-3">
        <BigButton size="xl" icon="🧑‍💼" onClick={() => nav('/visitor/new')}>{t('visitor_in')}</BigButton>
      </div>
      <section className="px-3 pb-6">
        <h2 className="mb-1 text-xl font-bold">{t('visitors_inside')} ({inside.length})</h2>
        {inside.length === 0 ? <p className="text-gray-500">{t('no_visitors_inside')}</p> : <p className="mb-2 text-sm text-gray-500">{t('tap_to_out')}</p>}
        <ul className="grid gap-2">
          {inside.map((v) => (
            <li key={v.id} className="min-w-0">
              <Link to={`/visitor/${v.id}`} className="card flex items-center gap-3 overflow-hidden p-2">
                <Photo path={v.photo_path} className="thumb" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-semibold">{v.name}{v.persons > 1 ? ` · ${t('people_count', { n: v.persons })}` : ''}</div>
                  <div className="truncate text-sm text-gray-600">{[v.company, t(`purpose_${v.purpose}`), v.meeting_name].filter(Boolean).join(' · ')}</div>
                  <div className="text-sm text-gray-600">{t('in')} {fmtTime(v.in_at)} · {fmtDuration(minutesBetween(v.in_at))}</div>
                </div>
                <span className="badge shrink-0 whitespace-nowrap bg-orange-100 text-base text-orange-800">{t('out')}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
