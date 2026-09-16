import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { UnitTabs, useUnit } from './lib'

interface Con { id: string; name: string; active: boolean }

export default function Contractors() {
  const [unit, setUnit] = useUnit()
  const [rows, setRows] = useState<Con[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = async () => {
    const { data, error } = await supabase.from('contractors').select('id, name, active').eq('unit_id', unit).order('name')
    if (error) setError(error.message); else setRows(data as Con[])
  }
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('contractors').insert({ unit_id: unit, name: name.trim() })
    if (error) setError(error.message); else { setName(''); await load() }
  }
  const patch = async (id: string, p: Partial<Con>) => {
    const { error } = await supabase.from('contractors').update(p).eq('id', id)
    if (error) setError(error.message); else await load()
  }
  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      {error && <p className="text-red-700">{error}</p>}
      <form onSubmit={(e) => void add(e)} className="mb-3 flex gap-2">
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
