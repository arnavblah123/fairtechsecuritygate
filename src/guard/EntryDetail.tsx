import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { reportMistake } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { localName, secondaryName } from '../lib/names'
import { fmtDateTime } from '../lib/time'
import type { Register } from '../lib/types'
import { useGuard } from './GuardApp'

const REASONS = ['reason_wrong_person', 'reason_wrong_direction', 'reason_duplicate', 'reason_other']

interface View {
  title: string
  second?: string | null
  photo: string | null
  keepPhoto: boolean
  lines: string[]
  direction: 'in' | 'out' | null
  at: string
  outAt?: string | null
  pending: boolean
  voided: string | null
  voidReason?: string | null
  flag?: string | null
  extraPhotos: { label: string; path: string }[]
}

export default function EntryDetail() {
  const { t, lang } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { register: reg, id } = useParams()
  const register = (['labour', 'visitor', 'vehicle'].includes(reg ?? '') ? reg : 'labour') as Register

  const data = useLiveQuery(async (): Promise<{ view: View; mistake: unknown } | null> => {
    const mistake = await db.mistakes.where('entry_id').equals(id!).first()
    if (register === 'labour') {
      const m = await db.movements.get(id!)
      if (!m) return null
      const l = await db.labourers.get(m.labourer_id)
      return { mistake, view: {
        title: l ? localName(l, lang) : '?', second: l ? secondaryName(l, lang) : null, photo: l?.photo_path ?? null, keepPhoto: true,
        lines: [l?.contractor_name ?? ''].filter(Boolean), direction: m.direction, at: m.at, pending: m.pending === 1, voided: m.voided_at, voidReason: m.void_reason, flag: m.flag,
        extraPhotos: m.carrying_photo_path ? [{ label: t('carrying_photo'), path: m.carrying_photo_path }] : [],
      } }
    }
    if (register === 'visitor') {
      const v = await db.visitors.get(id!)
      if (!v) return null
      return { mistake, view: {
        title: v.name, photo: v.photo_path, keepPhoto: false,
        lines: [[v.company, t(`purpose_${v.purpose}`)].filter(Boolean).join(' · '), v.meeting_name ? `${t('whom_to_meet')} ${v.meeting_name}` : '', `${t('people_count', { n: v.persons })} · ${t(`id_${v.id_type}`)}`].filter(Boolean),
        direction: null, at: v.in_at, outAt: v.out_at, pending: v.pending === 1 || v.out_pending === 1, voided: v.voided_at, voidReason: v.void_reason, extraPhotos: [],
      } }
    }
    const v = await db.vehicles.get(id!)
    if (!v) return null
    const extra: View['extraPhotos'] = []
    if (v.challan_photo_path) extra.push({ label: t('challan_photo'), path: v.challan_photo_path })
    if (v.loaded_photo_path) extra.push({ label: t('loaded_photo'), path: v.loaded_photo_path })
    if (v.gatepass_photo_path) extra.push({ label: t('gatepass_photo'), path: v.gatepass_photo_path })
    if (v.out_loaded_photo_path) extra.push({ label: `${t('out')} · ${t('loaded_photo')}`, path: v.out_loaded_photo_path })
    return { mistake, view: {
      title: v.plate, photo: v.plate_photo_path, keepPhoto: false,
      lines: [[t(`vt_${v.vehicle_type}`), t(`vp_${v.purpose}`)].join(' · '), v.driver_name ? `${t('driver_name')}: ${v.driver_name}` : '', v.out_loaded === true ? t('loaded_yes') : v.out_loaded === false ? t('loaded_no') : ''].filter(Boolean),
      direction: null, at: v.in_at, outAt: v.out_at, pending: v.pending === 1 || v.out_pending === 1, voided: v.voided_at, voidReason: v.void_reason, extraPhotos: extra,
    } }
  }, [id, register, lang])
  const [mode, setMode] = useState<'view' | 'reason' | 'sent'>('view')

  if (data === undefined) return <div className="min-h-screen"><TopBar title={t('entry_details')} /></div>
  if (data === null) { nav('/', { replace: true }); return null }
  const { view: v, mistake } = data

  const send = async (reasonKey: string) => {
    await reportMistake(s, register, id!, reasonKey.replace('reason_', ''))
    setMode('sent')
    setTimeout(() => nav('/', { replace: true }), 800)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('entry_details')} onBack={() => nav('/')} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <Photo path={v.photo} keep={v.keepPhoto} className={register === 'vehicle' ? 'mx-auto max-h-48 w-full rounded-3xl object-contain bg-gray-200' : 'mx-auto aspect-square w-40 rounded-3xl object-cover'} />
        <div className={`text-center ${v.voided ? 'line-through opacity-60' : ''}`}>
          <div className={`text-3xl font-bold ${register === 'vehicle' ? 'font-mono tracking-wider' : ''}`}>{v.title}</div>
          {v.second && <div className="text-lg text-gray-500">{v.second}</div>}
          <div className="text-sm text-gray-500">{t(register)}</div>
          {v.lines.map((l, i) => <div key={i} className="text-xl text-gray-700">{l}</div>)}
          {v.direction ? (
            <>
              <div className={`mt-1 text-2xl font-bold ${v.direction === 'in' ? 'text-green-700' : 'text-orange-600'}`}>{v.direction === 'in' ? t('in') : t('out')}</div>
              <div className="text-xl">{t('time')}: {fmtDateTime(v.at)}</div>
            </>
          ) : (
            <>
              <div className="mt-1 text-xl"><span className="font-bold text-green-700">{t('in')}</span> {fmtDateTime(v.at)}</div>
              {v.outAt && <div className="text-xl"><span className="font-bold text-orange-600">{t('out')}</span> {fmtDateTime(v.outAt)}</div>}
            </>
          )}
        </div>
        {v.flag && <p className="rounded-2xl bg-red-100 p-3 text-center text-xl font-bold text-red-800">⚠️ {t(`flag_${v.flag}`)}<br /><span className="text-base font-normal">{t('flagged_office')}</span></p>}
        {v.pending ? <p className="text-center text-orange-700">{t('pending_send')}</p> : null}
        {v.voided && <p className="rounded-2xl bg-gray-200 p-3 text-center text-xl">{t('voided')}{v.voidReason ? `: ${v.voidReason}` : ''}</p>}
        {v.extraPhotos.map((p) => (
          <div key={p.path}>
            <div className="mb-1 font-semibold">{p.label}</div>
            <Photo path={p.path} className="w-full rounded-2xl object-contain" />
          </div>
        ))}
        {mode === 'view' && !v.voided && (
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
