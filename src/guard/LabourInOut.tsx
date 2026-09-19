import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Blocked from '../components/Blocked'
import Photo from '../components/Photo'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { attachCarryingPhoto, latestMovement, recordMovement } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { localName, secondaryName } from '../lib/names'
import { fmtTime } from '../lib/time'
import type { Direction } from '../lib/types'
import { useGuard } from './GuardApp'

export default function LabourInOut() {
  const { t, lang } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const labourer = useLiveQuery(() => db.labourers.get(id!), [id])
  const blocked = useLiveQuery(() => db.blacklist.where('labourer_id').equals(id!).first(), [id])
  // undefined = loading, null = no movement on record
  const last = useLiveQuery(async () => (await latestMovement(id!)) ?? null, [id])
  const [confirmRepeat, setConfirmRepeat] = useState<Direction | null>(null)
  const [saved, setSaved] = useState<{ id: string; direction: Direction; flagged: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const go = async (direction: Direction, flagged = false) => {
    if (!labourer || busy) return
    setBusy(true)
    const mv = await recordMovement(s, labourer, direction, flagged ? `double_${direction}` : null)
    setBusy(false)
    setConfirmRepeat(null)
    setSaved({ id: mv.id, direction, flagged })
    if (direction === 'in' && !flagged) setTimeout(() => nav('/', { replace: true }), 700)
  }

  /** The small link offers the other direction. If that repeats the current status, ask first and flag it. */
  const other = (direction: Direction) => {
    if (last && last.direction === direction) setConfirmRepeat(direction)
    else void go(direction)
  }

  if (!labourer || last === undefined) return <div className="min-h-screen"><TopBar title={t('labour')} /></div>
  if (blocked) return <Blocked headName={s.unitHeadName} headPhone={s.unitHeadPhone} reason={blocked.reason} onBack={() => nav('/labour')} />

  const name = localName(labourer, lang)
  const second = secondaryName(labourer, lang)
  const next: Direction = last?.direction === 'in' ? 'out' : 'in'

  if (saved) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        <div className={`rounded-2xl p-6 text-center text-3xl font-bold text-white ${saved.direction === 'in' ? 'bg-green-700' : 'bg-orange-600'}`}>
          {name}<br />{saved.direction === 'in' ? t('in') : t('out')}<br />{t('saved')}
        </div>
        {saved.flagged && (
          <p className="rounded-2xl bg-red-100 p-3 text-center text-xl font-bold text-red-800">⚠️ {t(`flag_double_${saved.direction}`)}<br /><span className="text-base font-normal">{t('flagged_office')}</span></p>
        )}
        {saved.direction === 'out' && (
          <PhotoCapture label={t('carrying_something')} onDone={async (blob) => { await attachCarryingPhoto(s, saved.id, blob); nav('/', { replace: true }) }} />
        )}
        {(saved.direction === 'out' || saved.flagged) && (
          <BigButton size="xl" variant="plain" icon="✓" onClick={() => nav('/', { replace: true })}>{t('done')}</BigButton>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('labour')} onBack={() => nav('/labour')} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Photo path={labourer.photo_path} keep className="mx-auto aspect-square w-56 rounded-3xl object-cover" />
        <div className="text-center">
          <div className="text-3xl font-bold">{name}</div>
          {second && <div className="text-lg text-gray-500">{second}</div>}
          <div className="text-xl text-gray-600">{labourer.contractor_name ?? ''}</div>
          {labourer.status === 'pending' && <div className="text-base text-yellow-700">{t('pending_approval')}</div>}
        </div>

        <div className={`rounded-2xl p-3 text-center text-xl font-bold ${last?.direction === 'in' ? 'bg-green-100 text-green-800' : last ? 'bg-gray-200 text-gray-800' : 'bg-gray-100 text-gray-500'}`}>
          {last ? (last.direction === 'in' ? '🟢 ' + t('status_inside', { t: fmtTime(last.at) }) : '⚪ ' + t('status_outside', { t: fmtTime(last.at) })) : t('status_none')}
        </div>

        {confirmRepeat ? (
          <div className="rounded-2xl border-4 border-red-600 bg-red-50 p-4">
            <p className="mb-3 text-center text-2xl font-bold text-red-800">⚠️ {t(confirmRepeat === 'in' ? 'double_in_warn' : 'double_out_warn', { t: fmtTime(last!.at) })}</p>
            <div className="grid gap-3">
              <BigButton size="xl" variant="danger" icon="⚠️" onClick={() => void go(confirmRepeat, true)} disabled={busy}>{t('yes_continue')}</BigButton>
              <BigButton size="xl" variant="plain" onClick={() => setConfirmRepeat(null)} disabled={busy}>{t('cancel')}</BigButton>
            </div>
          </div>
        ) : (
          <>
            <BigButton size="xl" variant={next === 'in' ? 'in' : 'out'} icon={next === 'in' ? '⬇️' : '⬆️'} className="min-h-32 text-4xl" onClick={() => void go(next)} disabled={busy}>
              {next === 'in' ? t('in') : t('out')}
            </BigButton>
            <button type="button" className="min-h-14 text-lg text-gray-500 underline" onClick={() => other(next === 'in' ? 'out' : 'in')} disabled={busy}>
              {next === 'in' ? t('mark_out_instead') : t('mark_in_instead')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
