import { useEffect, useState, type FormEvent } from 'react'
import { compressPhoto, newPhotoPath } from '../lib/photo'
import { supabase } from '../lib/supabase'
import { fmtDateTime } from '../lib/time'
import { Thumb, UnitTabs, errMsg, useUnit } from './lib'

interface Lab { id: string; unit_id: string; name: string; contractor_id: string | null; photo_path: string | null; status: string; created_at: string; created_by_guard_id: string | null }
interface Con { id: string; name: string }
type Tab = 'approved' | 'pending' | 'inactive'

export default function Labourers() {
  const [unit, setUnit] = useUnit()
  const [tab, setTab] = useState<Tab>('approved')
  const [rows, setRows] = useState<Lab[]>([])
  const [cons, setCons] = useState<Con[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  // add form
  const [name, setName] = useState('')
  const [con, setCon] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // edit
  const [edit, setEdit] = useState<Lab | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')

  const load = async () => {
    const [l, c] = await Promise.all([
      supabase.from('labourers').select('id, unit_id, name, contractor_id, photo_path, status, created_at, created_by_guard_id').eq('unit_id', unit).order('name'),
      supabase.from('contractors').select('id, name').eq('unit_id', unit).eq('active', true).order('name'),
    ])
    if (l.error) setError(l.error.message); else setRows(l.data as Lab[])
    if (c.data) setCons(c.data as Con[])
  }
  useEffect(() => { void load() }, [unit]) // eslint-disable-line react-hooks/exhaustive-deps

  const uploadPhoto = async (f: File): Promise<string> => {
    const blob = await compressPhoto(f)
    const path = newPhotoPath(unit, 'labourer')
    const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
    if (error) throw error
    return path
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const photo_path = file ? await uploadPhoto(file) : null
      const { error } = await supabase.from('labourers').insert({ unit_id: unit, name: name.trim(), contractor_id: con || null, photo_path, status: 'approved' })
      if (error) throw error
      setName(''); setCon(''); setFile(null)
      await load()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  const update = async (id: string, patch: Partial<Lab>) => {
    setBusy(true); setError(null)
    const { error } = await supabase.from('labourers').update(patch).eq('id', id)
    if (error) setError(error.message)
    await load(); setBusy(false)
  }

  const replacePhoto = async (id: string, f: File) => {
    setBusy(true); setError(null)
    try { await update(id, { photo_path: await uploadPhoto(f) }) } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  /** Merge a guard-created pending person into an existing labourer: move their movements, then reject the duplicate. */
  const merge = async (dup: Lab, targetId: string) => {
    if (!targetId || !confirm('Move all entries of this pending person to the selected labourer and remove the duplicate?')) return
    setBusy(true); setError(null)
    const m = await supabase.from('labour_movements').update({ labourer_id: targetId }).eq('labourer_id', dup.id)
    if (m.error) { setError(m.error.message); setBusy(false); return }
    await update(dup.id, { status: 'rejected' })
    setEdit(null)
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

      <form onSubmit={(e) => void add(e)} className="mb-4 flex flex-wrap items-end gap-2 rounded border p-3">
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
        <thead><tr><th></th><th>Name</th><th>Contractor</th><th>Status</th><th>Added</th><th></th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td><Thumb path={r.photo_path} /></td>
              <td>{edit?.id === r.id ? <input className="a-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /> : r.name}</td>
              <td>{edit?.id === r.id ? (
                <select className="a-input" value={edit.contractor_id ?? ''} onChange={(e) => setEdit({ ...edit, contractor_id: e.target.value || null })}>
                  <option value="">—</option>{cons.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>) : cname(r.contractor_id)}</td>
              <td>{r.status}</td>
              <td className="text-sm text-gray-600">{fmtDateTime(r.created_at)}{r.created_by_guard_id ? ' by guard' : ''}</td>
              <td className="whitespace-nowrap">
                {edit?.id === r.id ? (
                  <span className="flex flex-wrap gap-1">
                    <button type="button" className="a-btn" disabled={busy} onClick={() => { void update(r.id, { name: edit.name.trim(), contractor_id: edit.contractor_id }); setEdit(null) }}>Save</button>
                    <label className="a-btn-plain cursor-pointer">Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && void replacePhoto(r.id, e.target.files[0])} /></label>
                    {r.status === 'pending' && (
                      <>
                        <select className="a-input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                          <option value="">Merge into…</option>
                          {rows.filter((x) => x.status === 'approved').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <button type="button" className="a-btn-plain" disabled={busy || !mergeTarget} onClick={() => void merge(r, mergeTarget)}>Merge</button>
                      </>
                    )}
                    <button type="button" className="a-btn-plain" onClick={() => setEdit(null)}>Cancel</button>
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    <button type="button" className="a-btn-plain" onClick={() => { setEdit(r); setMergeTarget('') }}>Edit</button>
                    {r.status === 'pending' && <button type="button" className="a-btn" disabled={busy} onClick={() => void update(r.id, { status: 'approved' })}>Approve</button>}
                    {r.status === 'pending' && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void update(r.id, { status: 'rejected' })}>Reject</button>}
                    {r.status === 'approved' && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void update(r.id, { status: 'inactive' })}>Deactivate</button>}
                    {(r.status === 'inactive' || r.status === 'rejected') && <button type="button" className="a-btn-plain" disabled={busy} onClick={() => void update(r.id, { status: 'approved' })}>Reactivate</button>}
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
