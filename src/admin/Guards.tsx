import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { UnitTabs, errMsg, useUnit } from './lib'

interface Guard { id: string; name: string; language: string | null; active: boolean }
const LANGS = [['', 'Unit default'], ['en', 'English'], ['hi', 'Hindi'], ['mr', 'Marathi'], ['gu', 'Gujarati']]

export default function Guards() {
  const [unit, setUnit] = useUnit()
  const [rows, setRows] = useState<Guard[]>([])
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [lang, setLang] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('guards').select('id, name, language, active').eq('unit_id', unit).order('name')
    if (error) setError(error.message); else setRows(data as Guard[])
  }
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  const setGuardPin = async (id: string, p: string) => {
    const { error } = await supabase.rpc('set_guard_pin', { p_guard: id, p_pin: p })
    if (error) throw error
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError(null); setMsg(null)
    try {
      const { data, error } = await supabase.from('guards').insert({ unit_id: unit, name: name.trim(), language: lang || null }).select('id').single()
      if (error) throw error
      await setGuardPin(data.id, pin)
      setName(''); setPin(''); setLang('')
      setMsg('Guard added.')
      await load()
    } catch (err) { setError(errMsg(err)) }
  }

  const changePin = async (g: Guard) => {
    const p = prompt(`New 4-digit PIN for ${g.name}:`)
    if (!p) return
    setError(null); setMsg(null)
    try { await setGuardPin(g.id, p); setMsg(`PIN updated for ${g.name}.`) } catch (err) { setError(errMsg(err)) }
  }

  const patch = async (id: string, p: Partial<Guard>) => {
    const { error } = await supabase.from('guards').update(p).eq('id', id)
    if (error) setError(error.message); else await load()
  }

  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      {error && <p className="text-red-700">{error}</p>}
      {msg && <p className="text-green-700">{msg}</p>}
      <form onSubmit={(e) => void add(e)} className="mb-3 flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="flex flex-col text-sm">Name<input className="a-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="flex flex-col text-sm">4-digit PIN<input className="a-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} pattern="\d{4}" required inputMode="numeric" /></label>
        <label className="flex flex-col text-sm">Language<select className="a-input" value={lang} onChange={(e) => setLang(e.target.value)}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="a-btn">Add guard</button>
      </form>
      <table className="a-table">
        <thead><tr><th>Name</th><th>Language</th><th>Active</th><th></th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td><select className="a-input" value={g.language ?? ''} onChange={(e) => void patch(g.id, { language: e.target.value || null })}>{LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td>{g.active ? 'yes' : 'no'}</td>
              <td className="flex gap-1">
                <button type="button" className="a-btn-plain" onClick={() => void changePin(g)}>Set PIN</button>
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
