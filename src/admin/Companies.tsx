import { useEffect, useState, type FormEvent } from 'react'
import { UNITS, admin, errMsg } from './lib'

interface Co { id: string; unit_id: string | null; name: string; category: string; active: boolean }
const CATS = ['raw_material', 'consumables', 'labour', 'repair', 'transport', 'rent', 'other']
const label = (c: string) => c.replace('_', ' ')

export default function Companies() {
  const [rows, setRows] = useState<Co[]>([])
  const [name, setName] = useState('')
  const [cat, setCat] = useState('other')
  const [unit, setUnit] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = () => admin.get<Co[]>('/api/admin/companies').then(setRows).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [])
  const run = (fn: () => Promise<unknown>) => fn().then(load).catch((e) => setError(errMsg(e)))
  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(() => admin.post('/api/admin/companies', { name: name.trim(), category: cat, unit_id: unit || null })).then(() => setName(''))
  }
  const patch = (id: string, p: Partial<Co>) => run(() => admin.patch(`/api/admin/companies/${id}`, p))
  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.category.includes(needle))
  return (
    <div>
      <p className="mb-2 text-sm text-gray-600">Vendors, transporters and service firms. Guards pick from this list for visitors and vehicles. Unit "both" means the name is offered at both gates.</p>
      {error && <p className="text-red-700">{error}</p>}
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <input className="a-input" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <select className="a-input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
        <select className="a-input" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">both units</option>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <button className="a-btn">Add</button>
        <input className="a-input ml-auto" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className={r.active ? '' : 'text-gray-400'}>
              <td><input className="a-input w-full" defaultValue={r.name} onBlur={(e) => e.target.value.trim() !== r.name && void patch(r.id, { name: e.target.value.trim() })} /></td>
              <td><select className="a-input" value={r.category} onChange={(e) => void patch(r.id, { category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></td>
              <td><select className="a-input" value={r.unit_id ?? ''} onChange={(e) => void patch(r.id, { unit_id: (e.target.value || null) as string })}><option value="">both</option>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
              <td>{r.active ? 'yes' : 'no'}</td>
              <td><button type="button" className="a-btn-plain" onClick={() => void patch(r.id, { active: !r.active })}>{r.active ? 'Deactivate' : 'Activate'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-gray-600">{rows.length} companies</p>
    </div>
  )
}
