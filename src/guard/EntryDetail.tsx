import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { reportMistake } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { fmtDateTime } from '../lib/time'
import { useGuard } from './GuardApp'

const REASONS = ['reason_wrong_person', 'reason_wrong_direction', 'reason_duplicate', 'reason_other']

export default function EntryDetail() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const data = useLiveQuery(async () => {
    const m = await db.movements.get(id!)
    if (!m) return null
    const l = await db.labourers.get(m.labourer_id)
    const mistake = await db.mistakes.where('entry_id').equals(m.id).first()
    return { m, l, mistake }
  }, [id])
  const [mode, setMode] = useState<'view' | 'reason' | 'sent'>('view')

  if (data === undefined) return <div className="min-h-screen"><TopBar title={t('entry_details')} /></div>
  if (data === null) { nav('/', { replace: true }); return null }
  const { m, l, mistake } = data

  const send = async (reasonKey: string) => {
    await reportMistake(s, 'labour', m.id, reasonKey.replace('reason_', ''))
    setMode('sent')
    setTimeout(() => nav('/', { replace: true }), 800)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('entry_details')} onBack={() => nav('/')} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Photo path={l?.photo_path} keep className="mx-auto aspect-square w-40 rounded-3xl object-cover" />
        <div className={`text-center ${m.voided_at ? 'line-through opacity-60' : ''}`}>
          <div className="text-3xl font-bold">{l?.name ?? '?'}</div>
          <div className={`mt-1 text-2xl font-bold ${m.direction === 'in' ? 'text-green-700' : 'text-orange-600'}`}>{m.direction === 'in' ? t('in') : t('out')}</div>
          <div className="text-xl">{t('time')}: {fmtDateTime(m.at)}</div>
        </div>
        {m.pending ? <p className="text-center text-orange-700">{t('pending_send')}</p> : null}
        {m.voided_at && <p className="rounded-2xl bg-gray-200 p-3 text-center text-xl">{t('voided')}{m.void_reason ? `: ${m.void_reason}` : ''}</p>}
        {m.carrying_photo_path && (
          <div>
            <div className="mb-1 font-semibold">{t('carrying_photo')}</div>
            <Photo path={m.carrying_photo_path} className="w-full rounded-2xl object-contain" />
          </div>
        )}
        {mode === 'view' && !m.voided_at && (
          mistake ? <p className="rounded-2xl bg-yellow-100 p-3 text-center text-xl">{t('mistake_reported')}</p>
            : <BigButton variant="plain" icon="✏️" onClick={() => setMode('reason')}>{t('report_mistake')}</BigButton>
        )}
        {mode === 'reason' && (
          <>
            <p className="text-2xl">{t('mistake_reason')}</p>
            {REASONS.map((r) => <BigButton key={r} variant="choice" onClick={() => void send(r)}>{t(r)}</BigButton>)}
            <BigButton variant="plain" onClick={() => setMode('view')}>{t('cancel')}</BigButton>
          </>
        )}
        {mode === 'sent' && <p className="rounded-2xl bg-green-700 p-4 text-center text-2xl font-bold text-white">{t('sent')}</p>}
      </div>
    </div>
  )
}
