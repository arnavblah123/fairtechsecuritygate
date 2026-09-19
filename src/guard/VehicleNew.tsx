import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Blocked from '../components/Blocked'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { createVehicle, normalizePlate } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { VEHICLE_PURPOSES, VEHICLE_TYPES, type BlacklistEntry, type VehiclePurpose, type VehicleType } from '../lib/types'
import { useGuard } from './GuardApp'

const STEPS = ['photo', 'plate', 'type', 'purpose', 'driver', 'extra', 'saved'] as const
type Step = (typeof STEPS)[number]
const TYPE_ICON: Record<VehicleType, string> = { truck: '🚛', tempo: '🚚', trailer: '🚜', car: '🚗', bike: '🏍️', crane_hydra: '🏗️' }
const PURPOSE_ICON: Record<VehiclePurpose, string> = { material_in: '📦', material_out: '📤', scrap_out: '🗑️', empty: '⬜', visitor: '🧑‍💼' }
type Extra = 'challan'

/** Photos the purpose requires before IN can be saved (also enforced by the database). The loaded-vehicle photo for
 *  Material OUT / Scrap OUT is taken later at the gate, before OUT. */
export function requiredPhotos(p: VehiclePurpose): Extra[] {
  return p === 'material_in' ? ['challan'] : []
}

export const needsLoadedPhoto = (p: VehiclePurpose) => p === 'material_out' || p === 'scrap_out'

export default function VehicleNew() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const blacklist = useLiveQuery(() => db.blacklist.filter((b) => b.kind === 'plate').toArray(), [], [])
  const [step, setStep] = useState<Step>('photo')
  const [platePhoto, setPlatePhoto] = useState<Blob | null>(null)
  const [plate, setPlate] = useState('')
  const [type, setType] = useState<VehicleType | null>(null)
  const [purpose, setPurpose] = useState<VehiclePurpose | null>(null)
  const [driver, setDriver] = useState('')
  const [extras, setExtras] = useState<Partial<Record<Extra, Blob>>>({})
  const [blocked, setBlocked] = useState<BlacklistEntry | null>(null)
  const [busy, setBusy] = useState(false)

  const back = () => {
    const i = STEPS.indexOf(step)
    if (i <= 0 || step === 'saved') nav('/vehicle')
    else setStep(STEPS[i - 1])
  }

  const checkPlate = () => {
    const p = normalizePlate(plate)
    const hit = blacklist.find((b) => b.plate && normalizePlate(b.plate) === p)
    if (hit) { setBlocked(hit); return }
    setStep('type')
  }

  const save = async (photos: Partial<Record<Extra, Blob>>) => {
    if (!platePhoto || !type || !purpose || busy) return
    setBusy(true)
    try {
      await createVehicle(s, { plate, vehicle_type: type, purpose, driver_name: driver.trim() || null }, { plate: platePhoto, challan: photos.challan ?? null })
      setStep('saved')
      setTimeout(() => nav('/', { replace: true }), 900)
    } finally {
      setBusy(false)
    }
  }

  const afterDriver = () => {
    if (!purpose) return
    if (requiredPhotos(purpose).length === 0) void save({})
    else setStep('extra')
  }

  const onExtra = (kind: Extra, blob: Blob) => {
    const next = { ...extras, [kind]: blob }
    setExtras(next)
    if (purpose && requiredPhotos(purpose).every((k) => next[k])) void save(next)
  }

  if (blocked) return <Blocked headName={s.unitHeadName} headPhone={s.unitHeadPhone} reason={blocked.reason} onBack={() => { setBlocked(null); nav('/vehicle') }} />

  const missing = purpose ? requiredPhotos(purpose).find((k) => !extras[k]) : undefined
  const extraLabel: Record<Extra, string> = { challan: t('challan_photo') }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('new_vehicle')} onBack={back} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {step === 'photo' && (
          <>
            <p className="text-2xl">{t('plate_photo')}</p>
            <PhotoCapture label={t('plate_photo')} onDone={(b) => { setPlatePhoto(b); setStep('plate') }} />
          </>
        )}

        {step === 'plate' && (
          <>
            <label className="text-2xl">{t('type_plate')}</label>
            <input className="input font-mono uppercase tracking-widest" autoFocus autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              placeholder="MH 12 AB 1234" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <BigButton size="xl" icon="➡️" disabled={normalizePlate(plate).length < 4} onClick={checkPlate}>{t('next')}</BigButton>
          </>
        )}

        {step === 'type' && (
          <>
            <p className="text-2xl">{t('select_vehicle_type')}</p>
            <div className="grid grid-cols-2 gap-3">
              {VEHICLE_TYPES.map((v) => (
                <BigButton key={v} variant="choice" icon={TYPE_ICON[v]} selected={type === v} className="min-h-24 flex-col gap-1" onClick={() => { setType(v); setStep('purpose') }}>{t(`vt_${v}`)}</BigButton>
              ))}
            </div>
          </>
        )}

        {step === 'purpose' && (
          <>
            <p className="text-2xl">{t('select_vehicle_purpose')}</p>
            {VEHICLE_PURPOSES.map((p) => (
              <BigButton key={p} variant="choice" icon={PURPOSE_ICON[p]} selected={purpose === p} onClick={() => { setPurpose(p); setStep('driver') }}>{t(`vp_${p}`)}</BigButton>
            ))}
          </>
        )}

        {step === 'driver' && (
          <>
            <label className="text-2xl">{t('type_driver_name')}</label>
            <input className="input" autoFocus autoCapitalize="words" value={driver} onChange={(e) => setDriver(e.target.value)} />
            {purpose && needsLoadedPhoto(purpose) && <p className="rounded-2xl bg-blue-50 p-3 text-center text-lg text-blue-900">📷 {t('loaded_photo_later')}</p>}
            {purpose && requiredPhotos(purpose).length === 0 ? (
              <BigButton size="xl" variant="in" icon="⬇️" disabled={busy} onClick={afterDriver}>{t('in')}</BigButton>
            ) : (
              <BigButton size="xl" icon="➡️" onClick={afterDriver}>{driver.trim() ? t('next') : t('skip')}</BigButton>
            )}
          </>
        )}

        {step === 'extra' && missing && (
          <>
            <p className="text-2xl">{extraLabel[missing]}</p>
            <p className="text-gray-600">{t('photo_required')}</p>
            <PhotoCapture key={missing} label={extraLabel[missing]} onDone={(b) => onExtra(missing, b)} />
          </>
        )}
        {step === 'extra' && !missing && <p className="text-center text-2xl">…</p>}

        {step === 'saved' && (
          <div className="rounded-2xl bg-green-700 p-6 text-center text-3xl font-bold text-white"><span className="font-mono tracking-wider">{normalizePlate(plate)}</span><br />{t('in')}<br />{t('saved')}</div>
        )}
      </div>
    </div>
  )
}
