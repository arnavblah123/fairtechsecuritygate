import { useEffect, useState } from 'react'
import { fmtDateTime } from '../lib/time'
import { UNITS, admin, errMsg } from './lib'

interface UnitRow { id: string; name: string; report_email: string | null; notify_each: boolean; shift_start: string }
interface LogRow { id: string; unit_id: string; kind: string; to_email: string | null; subject: string; sent_at: string | null; error: string | null; created_at: string }
interface ReportRow { unit_id: string; report_date: string; sent_at: string | null; error: string | null }
interface Data { mode: string | null; units: UnitRow[]; log: LogRow[]; reports: ReportRow[] }

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/** Per-unit email addresses, test email, daily report preview / send, and the log of every email. */
export default function Email() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [day, setDay] = useState(today())

  const load = () => admin.get<Data>('/api/admin/email').then((d) => { setData(d); setError(null) }).catch((e) => setError(errMsg(e)))
  useEffect(() => { void load() }, [])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setError(null); setMsg(null)
    try { await fn(); if (ok) setMsg(ok); await load() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }
  const patch = (id: string, p: Partial<UnitRow>) => run(() => admin.patch(`/api/admin/units/${id}`, p), 'Saved.')

  return (
    <div>
      {data && !data.mode && (
        <div className="mb-3 rounded border border-orange-300 bg-orange-50 p-2 text-sm">
          <b>Emails are switched off.</b> They are sent by the production app. In this app's Vercel project → Settings → Environment Variables
          add <code>GATE_PRODUCTION_KEY</code> with the production app's <code>INTEGRATION_EXPORT_KEY</code> (or its <code>GATE_EXPORT_KEY</code>), then redeploy.
        </div>
      )}
      {data?.mode && <p className="mb-2 text-sm text-gray-600">Sending through: <b>{data.mode === 'production' ? 'the production app (its Gmail account)' : data.mode}</b>.
        {data.mode === 'production' && ' A new address must also be added to GATE_MAIL_TO on the production app, or it will refuse it.'}</p>}
      {error && <p className="mb-2 text-red-700">{error}</p>}
      {msg && <p className="mb-2 text-green-700">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {UNITS.map((u) => {
          const row = data?.units.find((x) => x.id === u.id)
          if (!row) return null
          return (
            <section key={u.id} className="rounded border p-3">
              <h2 className="mb-2 text-lg font-bold">{u.name}</h2>
              <label className="flex flex-col text-sm">Send to (several: separate with commas)
                <input className="a-input" defaultValue={row.report_email ?? ''} key={row.report_email ?? ''}
                  onBlur={(e) => e.target.value.trim() !== (row.report_email ?? '') && void patch(u.id, { report_email: e.target.value })} />
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={row.notify_each} onChange={(e) => void patch(u.id, { notify_each: e.target.checked })} />
                Email every IN / OUT (labour, visitors, vehicles)
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm">Shift start (for late arrivals in the daily report)
                <input className="a-input w-24" defaultValue={String(row.shift_start).slice(0, 5)} key={row.shift_start}
                  onBlur={(e) => e.target.value !== String(row.shift_start).slice(0, 5) && void patch(u.id, { shift_start: e.target.value })} />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void run(() => admin.post('/api/admin/email/test', { unit: u.id }), `Test email sent to ${row.report_email}.`)}>Send test email</button>
                <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void run(async () => setPreview(await admin.get(`/api/admin/daily-report?unit=${u.id}&date=${day}`)))}>Preview daily report</button>
                <button type="button" className="a-btn" disabled={busy} onClick={() => confirm(`Send the ${day} report for ${u.name} now?`) && void run(() => admin.post('/api/admin/daily-report', { unit: u.id, date: day }), 'Daily report sent.')}>Send daily report now</button>
              </div>
            </section>
          )
        })}
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Report date <input type="date" className="a-input" value={day} onChange={(e) => setDay(e.target.value)} />.
        The daily report goes out by itself every day at 8:00 pm IST.
      </p>

      {preview && (
        <section className="mt-4 rounded border p-3">
          <div className="mb-2 flex items-center gap-2"><b className="flex-1">{preview.subject}</b><button type="button" className="a-btn-plain" onClick={() => setPreview(null)}>Close preview</button></div>
          <iframe title="Daily report preview" className="h-[70vh] w-full rounded border" srcDoc={preview.html} sandbox="" />
        </section>
      )}

      <h3 className="mb-1 mt-5 font-semibold">Daily reports</h3>
      <table className="a-table">
        <thead><tr><th>Date</th><th>Unit</th><th>Sent</th><th>Error</th></tr></thead>
        <tbody>
          {(data?.reports ?? []).map((r) => (
            <tr key={`${r.unit_id}-${r.report_date}`} className={r.error ? 'text-red-700' : ''}>
              <td>{String(r.report_date).slice(0, 10)}</td><td>{r.unit_id}</td><td>{r.sent_at ? fmtDateTime(r.sent_at) : '—'}</td><td className="text-sm">{r.error ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1 mt-5 font-semibold">Last 100 emails</h3>
      <table className="a-table">
        <thead><tr><th>Time</th><th>Unit</th><th>Subject</th><th>To</th><th>Result</th></tr></thead>
        <tbody>
          {(data?.log ?? []).map((r) => (
            <tr key={r.id} className={r.error ? 'bg-red-50 text-red-800' : ''}>
              <td className="whitespace-nowrap">{fmtDateTime(r.created_at)}</td><td>{r.unit_id}</td><td>{r.subject}</td><td className="text-sm">{r.to_email ?? ''}</td>
              <td className="text-sm">{r.error ? `failed: ${r.error}` : 'sent'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
