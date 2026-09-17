import { useEffect, useState } from 'react'
import { fmtDateTime } from '../lib/time'
import { Thumb, UNITS, admin, errMsg } from './lib'

interface Counts { unit_id: string; labour: number; visitors: number; vehicles: number }
interface Row { id: string; unit_id: string; direction: string; at: string; offline: boolean; voided_at: string | null; labourer_name: string; photo_path: string | null; guard_name: string | null }
interface Device { id: string; unit_id: string; label: string | null; last_seen_at: string | null; active: boolean }

export default function Live() {
  const [data, setData] = useState<{ counts: Counts[]; movements: Row[]; devices: Device[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try { setData(await admin.get('/api/admin/live')) } catch (e) { setError(errMsg(e)) }
  }
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60_000); return () => clearInterval(t) }, [])

  return (
    <div>
      {error && <p className="text-red-700">{error}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {UNITS.map((u) => {
          const c = data?.counts.find((x) => x.unit_id === u.id)
          const dev = (data?.devices ?? []).filter((d) => d.unit_id === u.id && d.active)
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
          {(data?.movements ?? []).map((r) => (
            <tr key={r.id} className={r.voided_at ? 'line-through text-gray-400' : ''}>
              <td><Thumb path={r.photo_path} size={36} /></td>
              <td>{r.unit_id}</td><td>{r.labourer_name}</td><td>{r.direction.toUpperCase()}</td>
              <td>{fmtDateTime(r.at)}{r.offline ? ' (offline)' : ''}</td><td>{r.guard_name}</td>
              <td>{r.voided_at ? 'voided' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
