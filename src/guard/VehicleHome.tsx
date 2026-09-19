import { Link, useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { useT } from '../lib/i18n'
import { fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { useVehiclesInside } from './inside'
import { needsLoadedPhoto } from './VehicleNew'

export const LONG_INSIDE_MIN = 4 * 60

export default function VehicleHome() {
  const { t } = useT()
  const nav = useNavigate()
  const inside = useVehiclesInside()
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('vehicle')} onBack={() => nav('/')} />
      <div className="p-3">
        <BigButton size="xl" icon="🚚" onClick={() => nav('/vehicle/new')}>{t('vehicle_in')}</BigButton>
      </div>
      <section className="px-3 pb-6">
        <h2 className="mb-1 text-xl font-bold">{t('vehicles_inside')} ({inside.length})</h2>
        {inside.length === 0 ? <p className="text-gray-500">{t('no_vehicles_inside')}</p> : <p className="mb-2 text-sm text-gray-500">{t('tap_to_out')}</p>}
        <ul className="grid gap-2">
          {inside.map((v) => {
            const mins = minutesBetween(v.in_at)
            const long = mins >= LONG_INSIDE_MIN
            return (
              <li key={v.id} className="min-w-0">
                <Link to={`/vehicle/${v.id}`} className={`card flex items-center gap-3 overflow-hidden p-2 ${long ? 'border-red-400 bg-red-50' : ''}`}>
                  <Photo path={v.plate_photo_path} className="thumb" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xl font-bold tracking-wider">{v.plate}</div>
                    <div className="truncate text-sm text-gray-600">{[t(`vt_${v.vehicle_type}`), t(`vp_${v.purpose}`), v.driver_name].filter(Boolean).join(' · ')}</div>
                    <div className={`text-sm ${long ? 'font-bold text-red-700' : 'text-gray-600'}`}>{t('in')} {fmtTime(v.in_at)} · {fmtDuration(mins)}{long ? ` · ${t('long_inside')}` : ''}</div>
                    {needsLoadedPhoto(v.purpose) && !v.loaded_photo_path && <div className="text-sm font-semibold text-blue-800">📷 {t('loaded_photo_pending')}</div>}
                  </div>
                  <span className="badge shrink-0 whitespace-nowrap bg-orange-100 text-base text-orange-800">{t('out')}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
