import { useEffect, useState } from 'react'
import { fmtDateTime } from '../lib/time'
import { UNITS, admin, errMsg } from './lib'

interface Device { id: string; unit_id: string; label: string | null; registered_at: string; last_seen_at: string | null; locked_until: string | null; active: boolean; guard_name: string | null }

export default function Devices() {
  const [rows, setRows] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = () => admin.get<Device[]>('/api/admin/devices').then(setRows).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [])
  const patch = (id: string, p: Partial<Device>) => admin.patch(`/api/admin/devices/${id}`, p).then(load).catch((e) => setError(errMsg(e)))
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
              <td>{d.guard_name ?? ''}</td>
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
