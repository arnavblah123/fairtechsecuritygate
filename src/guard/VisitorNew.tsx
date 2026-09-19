import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { createVisitor } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { ID_TYPES, VISITOR_PURPOSES, type IdType, type VisitorPurpose } from '../lib/types'
import { useGuard } from './GuardApp'

const STEPS = ['photo', 'name', 'company', 'purpose', 'meet', 'id', 'persons', 'saved'] as const
type Step = (typeof STEPS)[number]
const PURPOSE_ICON: Record<VisitorPurpose, string> = { client: '🤝', supplier: '📦', transporter: '🚚', government: '🏛️', interview: '📝', other: '❓' }
const ID_ICON: Record<IdType, string> = { aadhaar: '🪪', dl: '🚗', company_id: '🏢', none: '➖' }

/** One question per screen, big Next button. */
export default function VisitorNew() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const staff = useLiveQuery(() => db.staff.toArray(), [], [])
  const companies = useLiveQuery(() => db.companies.toArray(), [], [])
  const [step, setStep] = useState<Step>('photo')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [purpose, setPurpose] = useState<VisitorPurpose | null>(null)
  const [meet, setMeet] = useState<{ id: string | null; name: string }>({ id: null, name: '' })
  const [idType, setIdType] = useState<IdType>('none')
  const [persons, setPersons] = useState(1)
  const [busy, setBusy] = useState(false)

  const go = (to: Step) => setStep(to)
  const back = () => {
    const i = STEPS.indexOf(step)
    if (i <= 0 || step === 'saved') nav('/visitor')
    else setStep(STEPS[i - 1])
  }

  const finish = async (n: number) => {
    if (!photo || !purpose || busy) return
    setBusy(true)
    try {
      await createVisitor(s, {
        name: name.trim(), company: company.trim() || null, purpose,
        meeting_staff_id: meet.id, meeting_name: meet.name.trim() || null, persons: n, id_type: idType,
      }, photo)
      setStep('saved')
      setTimeout(() => nav('/', { replace: true }), 900)
    } finally {
      setBusy(false)
    }
  }

  const needle = company.trim().toLowerCase()
  const companyMatches = needle ? companies.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 8) : companies.slice(0, 8)

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('new_visitor')} onBack={back} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {step === 'photo' && <PhotoCapture autoOpen onDone={(b) => { setPhoto(b); go('name') }} />}

        {step === 'name' && (
          <>
            <label className="text-2xl">{t('type_name')}</label>
            <input className="input" autoFocus autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} />
            <BigButton size="xl" icon="➡️" disabled={name.trim().length < 2} onClick={() => go('company')}>{t('next')}</BigButton>
          </>
        )}

        {step === 'company' && (
          <>
            <label className="text-2xl">{t('select_company')}</label>
            <input className="input" autoFocus placeholder={t('type_company')} value={company} onChange={(e) => setCompany(e.target.value)} />
            {companyMatches.map((c) => (
              <BigButton key={c.id} variant="choice" selected={c.name === company} onClick={() => { setCompany(c.name); go('purpose') }}>{c.name}</BigButton>
            ))}
            <BigButton size="xl" icon="➡️" onClick={() => go('purpose')}>{company.trim() ? t('next') : t('skip')}</BigButton>
          </>
        )}

        {step === 'purpose' && (
          <>
            <p className="text-2xl">{t('select_purpose')}</p>
            {VISITOR_PURPOSES.map((p) => (
              <BigButton key={p} variant="choice" icon={PURPOSE_ICON[p]} selected={purpose === p} onClick={() => { setPurpose(p); go('meet') }}>{t(`purpose_${p}`)}</BigButton>
            ))}
          </>
        )}

        {step === 'meet' && (
          <>
            <p className="text-2xl">{t('whom_to_meet')}</p>
            {staff.map((st) => (
              <BigButton key={st.id} variant="choice" selected={meet.id === st.id} onClick={() => { setMeet({ id: st.id, name: st.name }); go('id') }}>{st.name}</BigButton>
            ))}
            <input className="input" placeholder={t('type_staff_name')} value={meet.id ? '' : meet.name} onChange={(e) => setMeet({ id: null, name: e.target.value })} />
            <BigButton size="xl" icon="➡️" onClick={() => go('id')}>{meet.name.trim() ? t('next') : t('skip')}</BigButton>
          </>
        )}

        {step === 'id' && (
          <>
            <p className="text-2xl">{t('select_id_type')}</p>
            {ID_TYPES.map((i) => (
              <BigButton key={i} variant="choice" icon={ID_ICON[i]} selected={idType === i} onClick={() => { setIdType(i); go('persons') }}>{t(`id_${i}`)}</BigButton>
            ))}
          </>
        )}

        {step === 'persons' && (
          <>
            <p className="text-2xl">{t('persons')}</p>
            <div className="flex items-center justify-center gap-4">
              <button type="button" className="btn btn-plain h-24 w-24 text-5xl" onClick={() => setPersons((n) => Math.max(1, n - 1))}>−</button>
              <span className="w-24 text-center text-6xl font-bold">{persons}</span>
              <button type="button" className="btn btn-plain h-24 w-24 text-5xl" onClick={() => setPersons((n) => Math.min(50, n + 1))}>+</button>
            </div>
            <BigButton size="xl" variant="in" icon="⬇️" disabled={busy} onClick={() => void finish(persons)}>{t('in')}</BigButton>
          </>
        )}

        {step === 'saved' && (
          <div className="rounded-2xl bg-green-700 p-6 text-center text-3xl font-bold text-white">{name}<br />{t('in')}<br />{t('saved')}</div>
        )}
      </div>
    </div>
  )
}
