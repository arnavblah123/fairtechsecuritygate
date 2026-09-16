import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { createLabourerAndEnter } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { useGuard } from './GuardApp'

export default function NewPerson() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const contractors = useLiveQuery(() => db.contractors.toCollection().sortBy('name'), [], [])
  const [step, setStep] = useState<'photo' | 'name' | 'contractor' | 'saved'>('photo')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const finish = async (contractorId: string | null, contractorName: string | null) => {
    if (!photo || busy) return
    setBusy(true)
    await createLabourerAndEnter(s, name.trim(), contractorId, contractorName, photo)
    setStep('saved')
    setTimeout(() => nav('/', { replace: true }), 900)
  }

  const back = () => {
    if (step === 'name') setStep('photo')
    else if (step === 'contractor') setStep('name')
    else nav('/labour')
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('new_person')} onBack={back} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {step === 'photo' && <PhotoCapture autoOpen onDone={(b) => { setPhoto(b); setStep('name') }} />}
        {step === 'name' && (
          <>
            <label className="text-2xl">{t('type_name')}</label>
            <input className="input" autoFocus autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} />
            <BigButton size="xl" icon="➡️" disabled={name.trim().length < 2} onClick={() => setStep('contractor')}>{t('next')}</BigButton>
          </>
        )}
        {step === 'contractor' && (
          <>
            <p className="text-2xl">{t('select_contractor')}</p>
            {contractors.map((c) => (
              <BigButton key={c.id} variant="choice" onClick={() => void finish(c.id, c.name)} disabled={busy}>{c.name}</BigButton>
            ))}
            <BigButton variant="choice" onClick={() => void finish(null, null)} disabled={busy}>{t('no_contractor')}</BigButton>
          </>
        )}
        {step === 'saved' && (
          <div className="rounded-2xl bg-green-700 p-6 text-center text-3xl font-bold text-white">{name}<br />{t('in')}<br />{t('saved')}</div>
        )}
      </div>
    </div>
  )
}
