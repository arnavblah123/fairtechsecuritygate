import { useEffect, useState } from 'react'
import { fmtDateTime, fmtDuration, fmtTime, minutesBetween } from '../lib/time'
import { Thumb, UNITS, admin, errMsg } from './lib'

interface Counts { unit_id: string; labour: number; visitors: number; vehicles: number }
interface Row { id: string; unit_id: string; direction: string; at: string; offline: boolean; voided_at: string | null; flag: string | null; labourer_name: string; photo_path: string | null; guard_name: string | null }
interface Device { id: string; unit_id: string; label: string | null; last_seen_at: string | null; active: boolean }
interface Inside { labourer_id: string; unit_id: string; name: string; photo_path: string | null; in_at: string; contractor_name: string | null }
interface VisitorRow { id: string; unit_id: string; name: string; company: string | null; purpose: string; meeting_name: string | null; persons: number; photo_path: string | null; in_at: string; out_at: string | null; voided_at: string | null; guard_name: string | null }
interface VehicleRow { id: string; unit_id: string; plate: string; vehicle_type: string; purpose: string; driver_name: string | null; plate_photo_path: string | null; in_at: string; out_at: string | null; out_loaded: boolean | null; voided_at: string | null; guard_name: string | null }
interface Live { counts: Counts[]; movements: Row[]; devices: Device[]; inside: Inside[]; visitors?: VisitorRow[]; vehicles?: VehicleRow[] }
const label = (s: string) => s.replace(/_/g, ' ')

export default function Live() {
  const [data, setData] = useState<Live | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const load = async () => {
    try { setData(await admin.get('/api/admin/live')); setError(null) } catch (e) { setError(errMsg(e)) }
  }
  useEffect(() => {
    void load()
    const t = setInterval(() => { void load(); setTick((x) => x + 1) }, 60_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      {error && <p className="text-red-700">{error}</p>}
      {!data && !error && <p className="text-gray-600">Loading…</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        {UNITS.map((u) => {
          const c = data?.counts.find((x) => x.unit_id === u.id)
          const inside = (data?.inside ?? []).filter((r) => r.unit_id === u.id)
          const today = (data?.movements ?? []).filter((r) => r.unit_id === u.id)
          const dev = (data?.devices ?? []).filter((d) => d.unit_id === u.id && d.active)
          const visitors = (data?.visitors ?? []).filter((r) => r.unit_id === u.id)
          const vehicles = (data?.vehicles ?? []).filter((r) => r.unit_id === u.id)
          const ins = today.filter((r) => r.direction === 'in' && !r.voided_at).length
          const outs = today.filter((r) => r.direction === 'out' && !r.voided_at).length
          const flagged = today.filter((r) => r.flag && !r.voided_at)
          return (
            <section key={u.id} className="rounded border p-3">
              <h2 className="text-lg font-bold">{u.name}</h2>
              <p>Inside now: <b>{c?.labour ?? 0}</b> labour · <b>{c?.visitors ?? 0}</b> visitors · <b>{c?.vehicles ?? 0}</b> vehicles</p>
              {flagged.length > 0 && (
                <p className="mt-1 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                  <b>⚠ {flagged.length} flagged today:</b> {flagged.map((r) => `${r.labourer_name} (${r.flag === 'double_in' ? 'IN again while already IN' : 'OUT again while already OUT'} at ${fmtTime(r.at)}${r.guard_name ? `, guard ${r.guard_name}` : ''})`).join('; ')}
                </p>
              )}
              <p className="text-sm text-gray-600">Today: {ins} IN · {outs} OUT · Phones: {dev.length === 0 ? 'none yet' : dev.map((d) => `${d.label?.slice(0, 20) ?? d.id.slice(0, 8)} (seen ${d.last_seen_at ? fmtDateTime(d.last_seen_at) : 'never'})`).join(', ')}</p>

              <h3 className="mb-1 mt-3 font-semibold">Labour inside now ({inside.length})</h3>
              {inside.length === 0 ? <p className="text-sm text-gray-500">Nobody inside.</p> : (
                <table className="a-table" data-tick={tick}>
                  <thead><tr><th></th><th>Name</th><th>Contractor</th><th>In since</th><th>Duration</th></tr></thead>
                  <tbody>
                    {inside.map((r) => (
                      <tr key={r.labourer_id}>
                        <td><Thumb path={r.photo_path} size={32} /></td>
                        <td>{r.name}</td><td>{r.contractor_name ?? ''}</td>
                        <td>{fmtDateTime(r.in_at)}</td><td>{fmtDuration(minutesBetween(r.in_at))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 className="mb-1 mt-3 font-semibold">Visitors: inside now and today ({visitors.length})</h3>
              {visitors.length === 0 ? <p className="text-sm text-gray-500">No visitors.</p> : (
                <table className="a-table">
                  <thead><tr><th></th><th>Name</th><th>Company · purpose</th><th>To meet</th><th>Persons</th><th>In</th><th>Out</th><th>Guard</th></tr></thead>
                  <tbody>
                    {visitors.map((r) => (
                      <tr key={r.id} className={r.voided_at ? 'line-through text-gray-400' : r.out_at ? '' : 'font-semibold'}>
                        <td><Thumb path={r.photo_path} size={32} /></td>
                        <td>{r.name}</td><td>{[r.company, label(r.purpose)].filter(Boolean).join(' · ')}</td><td>{r.meeting_name ?? ''}</td><td>{r.persons}</td>
                        <td>{fmtTime(r.in_at)}</td><td>{r.out_at ? fmtTime(r.out_at) : <span className="text-green-700">inside · {fmtDuration(minutesBetween(r.in_at))}</span>}</td><td>{r.guard_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 className="mb-1 mt-3 font-semibold">Vehicles: inside now and today ({vehicles.length})</h3>
              {vehicles.length === 0 ? <p className="text-sm text-gray-500">No vehicles.</p> : (
                <table className="a-table">
                  <thead><tr><th></th><th>Plate</th><th>Type · purpose</th><th>Driver</th><th>In</th><th>Out</th><th>Guard</th></tr></thead>
                  <tbody>
                    {vehicles.map((r) => {
                      const mins = minutesBetween(r.in_at)
                      return (
                        <tr key={r.id} className={r.voided_at ? 'line-through text-gray-400' : r.out_at ? '' : 'font-semibold'}>
                          <td><Thumb path={r.plate_photo_path} size={32} /></td>
                          <td className="font-mono">{r.plate}</td><td>{label(r.vehicle_type)} · {label(r.purpose)}</td><td>{r.driver_name ?? ''}</td>
                          <td>{fmtTime(r.in_at)}</td>
                          <td>{r.out_at ? `${fmtTime(r.out_at)}${r.out_loaded === true ? ' (loaded)' : r.out_loaded === false ? ' (empty)' : ''}` : <span className={mins >= 240 ? 'text-red-700' : 'text-green-700'}>inside · {fmtDuration(mins)}</span>}</td>
                          <td>{r.guard_name}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              <h3 className="mb-1 mt-3 font-semibold">Labour today's IN / OUT ({today.length})</h3>
              {today.length === 0 ? <p className="text-sm text-gray-500">No entries yet today.</p> : (
                <table className="a-table">
                  <thead><tr><th></th><th>Name</th><th>Dir</th><th>Time</th><th>Guard</th></tr></thead>
                  <tbody>
                    {today.map((r) => (
                      <tr key={r.id} className={r.voided_at ? 'line-through text-gray-400' : r.flag ? 'bg-red-50 text-red-800' : ''}>
                        <td><Thumb path={r.photo_path} size={32} /></td>
                        <td>{r.flag ? '⚠ ' : ''}{r.labourer_name}{r.flag ? <span className="block text-xs">{r.flag === 'double_in' ? 'IN again while already IN' : 'OUT again while already OUT'}</span> : null}</td>
                        <td className={r.direction === 'in' ? 'text-green-700 font-semibold' : 'text-orange-700 font-semibold'}>{r.direction.toUpperCase()}</td>
                        <td>{fmtTime(r.at)}{r.offline ? ' (offline)' : ''}{r.voided_at ? ' voided' : ''}</td>
                        <td>{r.guard_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
