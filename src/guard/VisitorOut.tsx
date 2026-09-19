import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { markVisitorOut } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { useGuard } from './GuardApp'

export default function VisitorOut() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const v = useLiveQuery(() => db.visitors.get(id!), [id])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!v) return <div className="min-h-screen"><TopBar title={t('visitor')} onBack={() => nav('/visitor')} /></div>

  const out = async () => {
    if (busy) return
    setBusy(true)
    await markVisitorOut(s, v.id)
    setSaved(true)
    setTimeout(() => nav('/visitor', { replace: true }), 800)
  }

  if (saved) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        <div className="rounded-2xl bg-orange-600 p-6 text-center text-3xl font-bold text-white">{v.name}<br />{t('out')}<br />{t('saved')}</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('visitor')} onBack={() => nav('/visitor')} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Photo path={v.photo_path} className="mx-auto aspect-square w-56 rounded-3xl object-cover" />
        <div className="text-center">
          <div className="text-3xl font-bold">{v.name}</div>
          <div className="text-xl text-gray-600">{[v.company, t(`purpose_${v.purpose}`)].filter(Boolean).join(' · ')}</div>
          {v.meeting_name && <div className="text-xl text-gray-600">{t('whom_to_meet')} {v.meeting_name}</div>}
          <div className="text-xl">{t('people_count', { n: v.persons })} · {t(`id_${v.id_type}`)}</div>
          <div className="text-xl">{t('inside_since')} {fmtTime(v.in_at)} · {fmtDuration(minutesBetween(v.in_at))}</div>
        </div>
        {v.out_at ? (
          <p className="rounded-2xl bg-gray-200 p-3 text-center text-xl">{t('out')} {fmtTime(v.out_at)}</p>
        ) : (
          <BigButton size="xl" variant="out" icon="⬆️" className="min-h-32 text-4xl" onClick={() => void out()} disabled={busy}>{t('confirm_out')}</BigButton>
        )}
      </div>
    </div>
  )
}
