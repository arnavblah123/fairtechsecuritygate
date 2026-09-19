import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { markVehicleOut } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { useGuard } from './GuardApp'
import { LONG_INSIDE_MIN } from './VehicleHome'

export default function VehicleOut() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const v = useLiveQuery(() => db.vehicles.get(id!), [id])
  const [mode, setMode] = useState<'view' | 'loaded_photo' | 'saved'>('view')
  const [busy, setBusy] = useState(false)

  if (!v) return <div className="min-h-screen"><TopBar title={t('vehicle')} onBack={() => nav('/vehicle')} /></div>

  const out = async (loaded: boolean | null, photo: Blob | null) => {
    if (busy) return
    setBusy(true)
    await markVehicleOut(s, v.id, loaded, photo)
    setMode('saved')
    setTimeout(() => nav('/vehicle', { replace: true }), 800)
  }

  if (mode === 'saved') {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        <div className="rounded-2xl bg-orange-600 p-6 text-center text-3xl font-bold text-white"><span className="font-mono tracking-wider">{v.plate}</span><br />{t('out')}<br />{t('saved')}</div>
      </div>
    )
  }

  const mins = minutesBetween(v.in_at)
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('vehicle')} onBack={() => nav('/vehicle')} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Photo path={v.plate_photo_path} className="mx-auto max-h-56 w-full rounded-3xl object-contain bg-gray-200" />
        <div className="text-center">
          <div className="font-mono text-3xl font-bold tracking-wider">{v.plate}</div>
          <div className="text-xl text-gray-600">{[t(`vt_${v.vehicle_type}`), t(`vp_${v.purpose}`)].join(' · ')}</div>
          {v.driver_name && <div className="text-xl text-gray-600">{t('driver_name')}: {v.driver_name}</div>}
          <div className={`text-xl ${mins >= LONG_INSIDE_MIN ? 'font-bold text-red-700' : ''}`}>{t('inside_since')} {fmtTime(v.in_at)} · {fmtDuration(mins)}</div>
        </div>

        {v.out_at && <p className="rounded-2xl bg-gray-200 p-3 text-center text-xl">{t('out')} {fmtTime(v.out_at)}</p>}

        {!v.out_at && mode === 'view' && v.purpose === 'empty' && (
          <>
            <p className="text-center text-2xl">{t('loaded_question')}</p>
            <BigButton size="xl" variant="out" icon="📦" disabled={busy} onClick={() => setMode('loaded_photo')}>{t('loaded_yes')}</BigButton>
            <BigButton size="xl" variant="secondary" icon="⬜" disabled={busy} onClick={() => void out(false, null)}>{t('loaded_no')}</BigButton>
          </>
        )}

        {!v.out_at && mode === 'view' && v.purpose !== 'empty' && (
          <BigButton size="xl" variant="out" icon="⬆️" className="min-h-32 text-4xl" disabled={busy} onClick={() => void out(null, null)}>{t('confirm_out')}</BigButton>
        )}

        {!v.out_at && mode === 'loaded_photo' && (
          <>
            <p className="text-2xl">{t('loaded_photo')}</p>
            <p className="text-gray-600">{t('photo_required')}</p>
            <PhotoCapture autoOpen label={t('loaded_photo')} onDone={(b) => void out(true, b)} />
            <BigButton variant="plain" onClick={() => setMode('view')}>{t('back')}</BigButton>
          </>
        )}
      </div>
    </div>
  )
}
