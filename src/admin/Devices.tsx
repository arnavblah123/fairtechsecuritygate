import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateTime } from '../lib/time'
import { UNITS } from './lib'

interface Device { id: string; unit_id: string; label: string | null; registered_at: string; last_seen_at: string | null; locked_until: string | null; active: boolean; guards: { name: string } | null }

export default function Devices() {
  const [rows, setRows] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = async () => {
    const { data, error } = await supabase.from('devices').select('id, unit_id, label, registered_at, last_seen_at, locked_until, active, guards(name)').order('registered_at', { ascending: false })
    if (error) setError(error.message); else setRows(data as unknown as Device[])
  }
  useEffect(() => { void load() }, [])
  const patch = async (id: string, p: Partial<Device>) => {
    const { error } = await supabase.from('devices').update(p).eq('id', id)
    if (error) setError(error.message); else await load()
  }
  return (
    <div>
      {error && <p className="text-red-700">{error}</p>}
      <p className="mb-2 text-sm text-gray-600">A phone is locked to a unit at its first login. Change the unit here if a phone moves; the guard must log out and in again.</p>
      <table className="a-table">
        <thead><tr><th>Label</th><th>Unit</th><th>Last guard</th><th>Last seen</th><th>Registered</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td><input className="a-input" defaultValue={d.label ?? ''} onBlur={(e) => e.target.value !== (d.label ?? '') && void patch(d.id, { label: e.target.value })} /><div className="text-xs text-gray-500">{d.id}</div></td>
              <td><select className="a-input" value={d.unit_id} onChange={(e) => void patch(d.id, { unit_id: e.target.value })}>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></td>
              <td>{d.guards?.name ?? ''}</td>
              <td>{d.last_seen_at ? fmtDateTime(d.last_seen_at) : ''}</td>
              <td>{fmtDateTime(d.registered_at)}</td>
              <td>{!d.active ? 'disabled' : d.locked_until && new Date(d.locked_until) > new Date() ? 'locked (wrong PINs)' : 'ok'}</td>
              <td className="flex gap-1">
                {d.locked_until && <button type="button" className="a-btn-plain" onClick={() => void patch(d.id, { locked_until: null })}>Unlock</button>}
                <button type="button" className="a-btn-plain" onClick={() => void patch(d.id, { active: !d.active })}>{d.active ? 'Disable' : 'Enable'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
