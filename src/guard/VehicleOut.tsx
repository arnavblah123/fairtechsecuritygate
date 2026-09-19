import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { attachVehicleLoadedPhoto, markVehicleOut } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { useGuard } from './GuardApp'
import { LONG_INSIDE_MIN } from './VehicleHome'
import { needsLoadedPhoto } from './VehicleNew'

/**
 * A vehicle that is inside. Material OUT / Scrap OUT: the loaded-vehicle photo is taken here, when the truck is
 * loaded (the guard can save just the photo and come back for OUT later). Empty: asks "going out loaded?".
 */
export default function VehicleOut() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const v = useLiveQuery(() => db.vehicles.get(id!), [id])
  const [mode, setMode] = useState<'view' | 'loaded_photo' | 'saved'>('view')
  const [busy, setBusy] = useState(false)
  const [photoSaved, setPhotoSaved] = useState(false)

  if (!v) return <div className="min-h-screen"><TopBar title={t('vehicle')} onBack={() => nav('/vehicle')} /></div>

  const out = async (loaded: boolean | null, photo: Blob | null) => {
    if (busy) return
    setBusy(true)
    await markVehicleOut(s, v.id, loaded, photo)
    setMode('saved')
    setTimeout(() => nav('/vehicle', { replace: true }), 800)
  }

  const savePhotoOnly = async (blob: Blob) => {
    if (busy) return
    setBusy(true)
    await attachVehicleLoadedPhoto(s, v.id, blob)
    setBusy(false)
    setPhotoSaved(true)
  }

  if (mode === 'saved') {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        <div className="rounded-2xl bg-orange-600 p-6 text-center text-3xl font-bold text-white"><span className="font-mono tracking-wider">{v.plate}</span><br />{t('out')}<br />{t('saved')}</div>
      </div>
    )
  }

  const mins = minutesBetween(v.in_at)
  const materialOut = needsLoadedPhoto(v.purpose)
  const photoMissing = materialOut && !v.loaded_photo_path

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

        {/* Material OUT / Scrap OUT: the loaded-vehicle photo comes first; OUT can be done now or later */}
        {!v.out_at && materialOut && (
          photoMissing ? (
            <div className="rounded-2xl border-4 border-blue-700 bg-blue-50 p-3">
              <p className="mb-2 text-center text-2xl font-bold text-blue-900">📷 {t('take_loaded_photo_first')}</p>
              <PhotoCapture label={t('loaded_photo')} onDone={(b) => void savePhotoOnly(b)} />
            </div>
          ) : (
            <div>
              <div className="mb-1 font-semibold text-green-800">✓ {photoSaved ? t('loaded_photo_done') : t('loaded_photo')}</div>
              <Photo path={v.loaded_photo_path} className="max-h-48 w-full rounded-2xl object-contain bg-gray-200" />
            </div>
          )
        )}

        {!v.out_at && mode === 'view' && v.purpose === 'empty' && (
          <>
            <p className="text-center text-2xl">{t('loaded_question')}</p>
            <BigButton size="xl" variant="out" icon="📦" disabled={busy} onClick={() => setMode('loaded_photo')}>{t('loaded_yes')}</BigButton>
            <BigButton size="xl" variant="secondary" icon="⬜" disabled={busy} onClick={() => void out(false, null)}>{t('loaded_no')}</BigButton>
          </>
        )}

        {!v.out_at && mode === 'view' && v.purpose !== 'empty' && !photoMissing && (
          <BigButton size="xl" variant="out" icon="⬆️" className="min-h-32 text-4xl" disabled={busy} onClick={() => void out(materialOut ? true : null, null)}>{t('confirm_out')}</BigButton>
        )}

        {!v.out_at && mode === 'loaded_photo' && (
          <>
            <p className="text-2xl">{t('loaded_photo')}</p>
            <p className="text-gray-600">{t('photo_required')}</p>
            <PhotoCapture label={t('loaded_photo')} onDone={(b) => void out(true, b)} />
            <BigButton variant="plain" onClick={() => setMode('view')}>{t('back')}</BigButton>
          </>
        )}
      </div>
    </div>
  )
}
