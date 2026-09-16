import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateTime, istDayStart } from '../lib/time'
import { Thumb, UNITS, errMsg } from './lib'

interface Counts { unit_id: string; labour: number; visitors: number; vehicles: number }
interface Row { id: string; unit_id: string; direction: string; at: string; offline: boolean; voided_at: string | null; labourers: { name: string; photo_path: string | null } | null; guards: { name: string } | null }
interface Device { id: string; unit_id: string; label: string | null; last_seen_at: string | null; active: boolean }

export default function Live() {
  const [counts, setCounts] = useState<Counts[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const [c, r, d] = await Promise.all([
        supabase.from('inside_counts').select('*'),
        supabase.from('labour_movements').select('id, unit_id, direction, at, offline, voided_at, labourers(name, photo_path), guards(name)').gte('at', istDayStart()).order('at', { ascending: false }).limit(200),
        supabase.from('devices').select('id, unit_id, label, last_seen_at, active').order('last_seen_at', { ascending: false }),
      ])
      if (c.error) throw c.error
      if (r.error) throw r.error
      if (d.error) throw d.error
      setCounts(c.data as Counts[]); setRows(r.data as unknown as Row[]); setDevices(d.data as Device[])
    } catch (e) { setError(errMsg(e)) }
  }
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t) }, [])

  return (
    <div>
      {error && <p className="text-red-700">{error}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {UNITS.map((u) => {
          const c = counts.find((x) => x.unit_id === u.id)
          const dev = devices.filter((d) => d.unit_id === u.id && d.active)
          return (
            <div key={u.id} className="rounded border p-3">
              <div className="text-lg font-bold">{u.name}</div>
              <div>Inside now: <b>{c?.labour ?? 0}</b> labour · <b>{c?.visitors ?? 0}</b> visitors · <b>{c?.vehicles ?? 0}</b> vehicles</div>
              <div className="text-sm text-gray-600">Phones: {dev.length === 0 ? 'none yet' : dev.map((d) => `${d.label?.slice(0, 20) ?? d.id.slice(0, 8)} (seen ${d.last_seen_at ? fmtDateTime(d.last_seen_at) : 'never'})`).join(', ')}</div>
            </div>
          )
        })}
      </div>
      <h2 className="mb-2 font-bold">Today's labour entries</h2>
      <table className="a-table">
        <thead><tr><th></th><th>Unit</th><th>Name</th><th>Dir</th><th>Time</th><th>Guard</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.voided_at ? 'line-through text-gray-400' : ''}>
              <td><Thumb path={r.labourers?.photo_path} size={36} /></td>
              <td>{r.unit_id}</td><td>{r.labourers?.name}</td><td>{r.direction.toUpperCase()}</td>
              <td>{fmtDateTime(r.at)}{r.offline ? ' (offline)' : ''}</td><td>{r.guards?.name}</td>
              <td>{r.voided_at ? 'voided' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
