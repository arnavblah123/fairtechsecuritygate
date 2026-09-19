import { useEffect, useState, type FormEvent } from 'react'
import { UnitTabs, admin, errMsg, useUnit } from './lib'

interface Row { id: string; name: string; phone: string | null; active: boolean; sort_order: number }

/** Office people a visitor can come to meet ("whom to meet" buttons on the phone). */
export default function Staff() {
  const [unit, setUnit] = useUnit()
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = () => admin.get<Row[]>(`/api/admin/staff?unit=${unit}`).then(setRows).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = (fn: () => Promise<unknown>) => fn().then(load).catch((e) => setError(errMsg(e)))
  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(() => admin.post('/api/admin/staff', { unit_id: unit, name: name.trim(), phone: phone.trim() || null })).then(() => { setName(''); setPhone('') })
  }
  const patch = (id: string, p: Partial<Row>) => run(() => admin.patch(`/api/admin/staff/${id}`, p))
  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      <p className="mb-2 text-sm text-gray-600">Shown on the phone as "Whom to meet?" buttons for a visitor. Lower order comes first.</p>
      {error && <p className="text-red-700">{error}</p>}
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input className="a-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="a-input" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button className="a-btn">Add</button>
      </form>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Order</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'text-gray-400'}>
              <td><input className="a-input" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && void patch(r.id, { name: e.target.value.trim() })} /></td>
              <td><input className="a-input" defaultValue={r.phone ?? ''} onBlur={(e) => (e.target.value.trim() || null) !== r.phone && void patch(r.id, { phone: e.target.value.trim() || null })} /></td>
              <td><input className="a-input w-20" type="number" defaultValue={r.sort_order} onBlur={(e) => Number(e.target.value) !== r.sort_order && void patch(r.id, { sort_order: Number(e.target.value) || 0 })} /></td>
              <td>{r.active ? 'yes' : 'no'}</td>
              <td><button type="button" className="a-btn-plain" onClick={() => void patch(r.id, { active: !r.active })}>{r.active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
