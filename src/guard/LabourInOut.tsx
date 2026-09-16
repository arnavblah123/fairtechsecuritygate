import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import PhotoCapture from '../components/PhotoCapture'
import TopBar from '../components/TopBar'
import { attachCarryingPhoto, nextDirection, recordMovement } from '../lib/api'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import type { Direction } from '../lib/types'
import { useGuard } from './GuardApp'

export default function LabourInOut() {
  const { t } = useT()
  const s = useGuard()
  const nav = useNavigate()
  const { id } = useParams()
  const labourer = useLiveQuery(() => db.labourers.get(id!), [id])
  const [next, setNext] = useState<Direction | null>(null)
  const [saved, setSaved] = useState<{ id: string; direction: Direction } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (id) void nextDirection(id).then(setNext) }, [id])

  const go = async (direction: Direction) => {
    if (!labourer || busy) return
    setBusy(true)
    const mv = await recordMovement(s, labourer, direction)
    setBusy(false)
    if (direction === 'in') {
      setSaved({ id: mv.id, direction })
      setTimeout(() => nav('/', { replace: true }), 700)
    } else {
      setSaved({ id: mv.id, direction })
    }
  }

  if (!labourer) return <div className="min-h-screen"><TopBar title={t('labour')} /></div>

  if (saved) {
    return (
      <div className="flex min-h-screen flex-col gap-4 p-4">
        <div className={`rounded-2xl p-6 text-center text-3xl font-bold text-white ${saved.direction === 'in' ? 'bg-green-700' : 'bg-orange-600'}`}>
          {labourer.name}<br />{saved.direction === 'in' ? t('in') : t('out')}<br />{t('saved')}
        </div>
        {saved.direction === 'out' && (
          <>
            <PhotoCapture label={t('carrying_something')} onDone={async (blob) => { await attachCarryingPhoto(s, saved.id, blob); nav('/', { replace: true }) }} />
            <BigButton size="xl" variant="plain" icon="✓" onClick={() => nav('/', { replace: true })}>{t('done')}</BigButton>
          </>
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
          <div className="text-3xl font-bold">{labourer.name}</div>
          <div className="text-xl text-gray-600">{labourer.contractor_name ?? ''}</div>
          {labourer.status === 'pending' && <div className="text-base text-yellow-700">{t('pending_approval')}</div>}
        </div>
        {next && (
          <>
            <BigButton size="xl" variant={next === 'in' ? 'in' : 'out'} icon={next === 'in' ? '⬇️' : '⬆️'} className="min-h-32 text-4xl" onClick={() => void go(next)} disabled={busy}>
              {next === 'in' ? t('in') : t('out')}
            </BigButton>
            <button type="button" className="min-h-14 text-lg text-gray-500 underline" onClick={() => void go(next === 'in' ? 'out' : 'in')} disabled={busy}>
              {next === 'in' ? t('mark_out_instead') : t('mark_in_instead')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
