import { useEffect, useState, type FormEvent } from 'react'
import { compressPhoto, newPhotoPath } from '../lib/photo'
import { fmtDateTime } from '../lib/time'
import { Thumb, UnitTabs, admin, errMsg, useUnit } from './lib'

interface Lab { id: string; unit_id: string; name: string; contractor_id: string | null; photo_path: string | null; status: string; skill: string | null; external_code: string | null; created_at: string; created_by_guard_id: string | null }
interface SyncStatus { configured: boolean; lastAt: string | null; lastResult: string | null }
interface Con { id: string; name: string; active: boolean }
type Tab = 'approved' | 'pending' | 'inactive'

export default function Labourers() {
  const [unit, setUnit] = useUnit()
  const [tab, setTab] = useState<Tab>('approved')
  const [rows, setRows] = useState<Lab[]>([])
  const [cons, setCons] = useState<Con[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [name, setName] = useState('')
  const [con, setCon] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [edit, setEdit] = useState<Lab | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [sync, setSync] = useState<SyncStatus | null>(null)

  const load = async () => {
    try {
      const [l, c, st] = await Promise.all([admin.get<Lab[]>(`/api/admin/labourers?unit=${unit}`), admin.get<Con[]>(`/api/admin/contractors?unit=${unit}`), admin.get<SyncStatus>('/api/admin/sync-status')])
      setRows(l); setCons(c.filter((x) => x.active)); setSync(st)
    } catch (e) { setError(errMsg(e)) }
  }
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null)
    try { await fn(); await load() } catch (e) { setError(errMsg(e)) } finally { setBusy(false) }
  }

  const uploadPhoto = async (f: File): Promise<string> => {
    const blob = await compressPhoto(f)
    const path = newPhotoPath(unit, 'labourer')
    await admin.putBlob(`/api/photos/${path}`, blob)
    return path
  }

  const add = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const photo_path = file ? await uploadPhoto(file) : null
      await admin.post('/api/admin/labourers', { unit_id: unit, name: name.trim(), contractor_id: con || null, photo_path })
      setName(''); setCon(''); setFile(null)
    })
  }
  const patch = (id: string, p: Partial<Lab>) => run(() => admin.patch(`/api/admin/labourers/${id}`, p))
  const replacePhoto = (id: string, f: File) => run(async () => admin.patch(`/api/admin/labourers/${id}`, { photo_path: await uploadPhoto(f) }))
  const merge = (dup: Lab, target: string) => {
    if (!target || !confirm('Move all entries of this pending person to the selected labourer and remove the duplicate?')) return
    void run(() => admin.post(`/api/admin/labourers/${dup.id}/merge`, { target })).then(() => setEdit(null))
  }

  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => (tab === 'approved' ? r.status === 'approved' : tab === 'pending' ? r.status === 'pending' : r.status === 'inactive' || r.status === 'rejected'))
    .filter((r) => !needle || r.name.toLowerCase().includes(needle))
  const pendingCount = rows.filter((r) => r.status === 'pending').length
  const cname = (id: string | null) => cons.find((c) => c.id === id)?.name ?? ''

  return (
    <div>
      <UnitTabs unit={unit} onChange={setUnit} />
      {error && <p className="mb-2 text-red-700">{error}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-sm">
        {sync?.configured ? (
          <>
            <button type="button" className="a-btn" disabled={busy} onClick={() => void run(async () => { const r = await admin.post<{ error?: string }>('/api/admin/sync-production'); if (r.error) throw new Error(r.error) })}>Sync from production now</button>
            <span>Linked to the production app. Automatic sync runs hourly. {sync.lastAt ? `Last: ${fmtDateTime(sync.lastAt)} · ${sync.lastResult ?? ''}` : 'Not synced yet.'}</span>
          </>
        ) : (
          <span>Not linked to the production app. Add <code>GATE_PRODUCTION_DATABASE_URL</code> in Vercel to mirror its employee list here automatically.</span>
        )}
      </div>

      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2 rounded border p-3">
        <label className="flex flex-col text-sm">Name<input className="a-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="flex flex-col text-sm">Contractor
          <select className="a-input" value={con} onChange={(e) => setCon(e.target.value)}>
            <option value="">—</option>
            {cons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-sm">Photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <button className="a-btn" disabled={busy}>Add labourer</button>
      </form>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(['approved', 'pending', 'inactive'] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded px-3 py-1 ${tab === t ? 'bg-gray-800 text-white' : 'bg-gray-200'}`}>
            {t === 'pending' ? `Pending approval (${pendingCount})` : t === 'inactive' ? 'Inactive / rejected' : 'Approved'}
          </button>
        ))}
        <input className="a-input ml-auto" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <table className="a-table">
        <thead><tr><th></th><th>Name</th><th>Code / skill</th><th>Contractor</th><th>Status</th><th>Added</th><th></th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td><Thumb path={r.photo_path} /></td>
              <td>{edit?.id === r.id && !r.external_code ? <input className="a-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /> : r.name}</td>
              <td className="text-sm text-gray-600">{r.external_code ?? ''}{r.skill ? ` · ${r.skill}` : ''}{r.external_code ? <div className="text-xs text-blue-700">from production app</div> : null}</td>
              <td>{edit?.id === r.id ? (
                <select className="a-input" value={edit.contractor_id ?? ''} onChange={(e) => setEdit({ ...edit, contractor_id: e.target.value || null })}>
                  <option value="">—</option>{cons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>) : cname(r.contractor_id)}</td>
              <td>{r.status}</td>
              <td className="text-sm text-gray-600">{fmtDateTime(r.created_at)}{r.created_by_guard_id ? ' by guard' : ''}</td>
              <td className="whitespace-nowrap">
                {edit?.id === r.id ? (
                  <span className="flex flex-wrap gap-1">
                    <button type="button" className="a-btn" disabled={busy} onClick={() => { void patch(r.id, { name: edit.name.trim(), contractor_id: edit.contractor_id }); setEdit(null) }}>Save</button>
                    <label className="a-btn-plain cursor-pointer">Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void replacePhoto(r.id, e.target.files[0])} /></label>
                    {r.status === 'pending' && (
                      <>
                        <select className="a-input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                          <option value="">Merge into…</option>
                          {rows.filter((x) => x.status === 'approved').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <button type="button" className="a-btn-plain" disabled={busy || !mergeTarget} onClick={() => merge(r, mergeTarget)}>Merge</button>
                      </>
                    )}
                    <button type="button" className="a-btn-plain" onClick={() => setEdit(null)}>Cancel</button>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    <button type="button" className="a-btn-plain" onClick={() => { setEdit(r); setMergeTarget('') }}>Edit</button>
                    {r.status === 'pending' && <button type="button" className="a-btn" disabled={busy} onClick={() => void patch(r.id, { status: 'approved' })}>Approve</button>}
                    {r.status === 'pending' && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void patch(r.id, { status: 'rejected' })}>Reject</button>}
                    {r.status === 'approved' && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void patch(r.id, { status: 'inactive' })}>Deactivate</button>}
                    {(r.status === 'inactive' || r.status === 'rejected') && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void patch(r.id, { status: 'approved' })}>Reactivate</button>}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
