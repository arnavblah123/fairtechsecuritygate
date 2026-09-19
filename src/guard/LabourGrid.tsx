import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import Photo from '../components/Photo'
import TopBar from '../components/TopBar'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { localName, nameMatches, secondaryName } from '../lib/names'
import { useLabourInside } from './inside'

export default function LabourGrid() {
  const { t, lang } = useT()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const labourers = useLiveQuery(() => db.labourers.filter((l) => l.status === 'approved' || l.status === 'pending').sortBy('name'), [], [])
  const inside = useLabourInside()

  const shown = q.trim() ? labourers.filter((l) => nameMatches(l, q)) : labourers

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('labour')} onBack={() => nav('/')} />
      <div className="p-3">
        <input className="input" placeholder={'🔍 ' + t('search_name')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2 px-3 pb-28 content-start">
        {shown.map((l) => {
          const second = secondaryName(l, lang)
          return (
            <Link key={l.id} to={`/labour/${l.id}`} className={`card relative overflow-hidden ${inside.has(l.id) ? 'border-green-600' : ''}`}>
              <Photo path={l.photo_path} keep className="aspect-square w-full object-cover" />
              {inside.has(l.id) && <span className="absolute right-1 top-1 rounded-full bg-green-600 px-2 text-sm font-bold text-white">IN</span>}
              {l.status === 'pending' && <span className="absolute left-1 top-1 rounded-full bg-yellow-400 px-2 text-xs font-bold">NEW</span>}
              <div className="px-1 py-1 text-center leading-tight">
                <div className="line-clamp-2 text-[16px] font-semibold">{localName(l, lang)}</div>
                {second && <div className="truncate text-[11px] text-gray-500">{second}</div>}
              </div>
            </Link>
          )
        })}
        {shown.length === 0 && <p className="col-span-3 py-6 text-center text-xl text-gray-500">{t('no_match')}</p>}
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t-2 border-gray-200 bg-white p-3">
        <BigButton size="xl" variant="secondary" icon="➕" onClick={() => nav('/labour/new')}>{t('new_person')}</BigButton>
      </div>
    </div>
  )
}
