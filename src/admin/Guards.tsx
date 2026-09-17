import { useEffect, useState, type FormEvent } from 'react'
import { UnitTabs, admin, errMsg, useUnit } from './lib'

interface Guard { id: string; name: string; language: string | null; active: boolean; has_pin: boolean }
const LANGS = [['', 'Unit default'], ['en', 'English'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['gu', 'Gujarati']]

export default function Guards() {
  const [unit, setUnit] = useUnit()
  const [rows, setRows] = useState<Guard[]>([])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [lang, setLang] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => admin.get<Guard[]>(`/api/admin/guards?unit=${unit}`).then(setRows).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn: () => Promise<unknown>, ok?: string) => {
    setError(null); setMsg(null)
    return fn().then(() => { if (ok) setMsg(ok) }).then(load).catch((e) => setError(errMsg(e)))
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(() => admin.post('/api/admin/guards', { unit_id: unit, name: name.trim(), language: lang || null, pin }), 'Guard added.').then(() => { setName(''); setPin(''); setLang('') })
  }
  const changePin = (g: Guard) => {
    const p = prompt(`New 4-digit PIN for ${g.name}:`)
    if (p) void run(() => admin.post(`/api/admin/guards/${g.id}/pin`, { pin: p }), `PIN updated for ${g.name}.`)
  }
  const patch = (id: string, p: Partial<Guard>) => run(() => admin.patch(`/api/admin/guards/${id}`, p))

  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      {error && <p className="text-red-700">{error}</p>}
      {msg && <p className="text-green-700">{msg}</p>}
      <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="flex flex-col text-sm">Name<input className="a-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="flex flex-col text-sm">4-digit PIN<input className="a-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} pattern="\d{4}" required inputMode="numeric" /></label>
        <label className="flex flex-col text-sm">Language<select className="a-input" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="a-btn">Add guard</button>
      </form>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Language</th><th>PIN</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td><select className="a-input" value={g.language ?? ''} onChange={(e) => void patch(g.id, { language: (e.target.value || null) as string })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td>{g.has_pin ? 'set' : 'not set'}</td>
              <td>{g.active ? 'yes' : 'no'}</td>
              <td className="flex gap-1">
                <button type="button" className="a-btn-plain" onClick={() => changePin(g)}>Set PIN</button>
                <button type="button" className="a-btn-plain" onClick={() => void patch(g.id, { active: !g.active })}>{g.active ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-gray-600">PINs are stored hashed. A PIN must be unique within a unit. Deactivating a guard blocks login at once; entries already on the phone still sync.</p>
    </div>
  )
}
