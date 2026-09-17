import { useEffect, useState, type FormEvent } from 'react'
import { UnitTabs, admin, errMsg, useUnit } from './lib'

interface Con { id: string; name: string; active: boolean }

export default function Contractors() {
  const [unit, setUnit] = useUnit()
  const [rows, setRows] = useState<Con[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = () => admin.get<Con[]>(`/api/admin/contractors?unit=${unit}`).then(setRows).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn: () => Promise<unknown>) => fn().then(load).catch((e) => setError(errMsg(e)))
  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(() => admin.post('/api/admin/contractors', { unit_id: unit, name: name.trim() })).then(() => setName(''))
  }
  const patch = (id: string, p: Partial<Con>) => run(() => admin.patch(`/api/admin/contractors/${id}`, p))
  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      {error && <p className="text-red-700">{error}</p>}
      <form onSubmit={add} className="mb-3 flex gap-2">
        <input className="a-input" placeholder="Contractor / company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="a-btn">Add</button>
      </form>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><input className="a-input" defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && void patch(r.id, { name: e.target.value.trim() })} /></td>
              <td>{r.active ? 'yes' : 'no'}</td>
              <td><button type="button" className="a-btn-plain" onClick={() => void patch(r.id, { active: !r.active })}>{r.active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
