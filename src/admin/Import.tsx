import { useState } from 'react'
import { UNITS, admin, errMsg, type AdminUnit } from './lib'

type Kind = 'labourers' | 'contractors' | 'companies'
const HELP: Record<Kind, string> = {
  labourers: 'One per line: name, contractor (optional). Example:\nSuresh Pawar, Shree Enterprises\nGanesh More',
  contractors: 'One name per line.',
  companies: 'One per line: name, category (optional), unit (optional). Category: raw material / consumables / labour / repair / transport / rent / other. Unit: dehu / savli / blank for both.\nExample:\nMittal Engineering Works, raw material\nRaj Electrical Works, repair, dehu',
}

/** Parse pasted CSV/TSV/Excel text. Quoted fields supported. First line is skipped if it looks like a header. */
function parse(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = lines.map((line) => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    const sep = line.includes('\t') ? '\t' : ','
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === sep && !inQ) { out.push(cur.trim()); cur = '' }
      else cur += ch
    }
    out.push(cur.trim())
    return out
  })
  if (rows.length && /^(name|labourer|worker|vendor|company|contractor)/i.test(rows[0][0])) rows.shift()
  return rows
}

export default function Import() {
  const [kind, setKind] = useState<Kind>('labourers')
  const [unit, setUnit] = useState<AdminUnit>('dehu')
  const [text, setText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const preview = parse(text)

  const go = async () => {
    setBusy(true); setResult(null)
    try {
      const rows = preview.map((r) => kind === 'labourers' ? { name: r[0], contractor: r[1] ?? '' } : kind === 'companies' ? { name: r[0], category: r[1] ?? '', unit: r[2] ?? '' } : { name: r[0] })
      const r = await admin.post<{ inserted: number; skipped: number }>('/api/admin/import', { type: kind, unit_id: unit, rows })
      setResult(`Done: ${r.inserted} added, ${r.skipped} already existed.`)
      setText('')
    } catch (e) { setResult('Error: ' + errMsg(e)) } finally { setBusy(false) }
  }

  const onFile = (f: File | undefined) => { if (f) void f.text().then(setText) }

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm text-gray-600">Paste rows copied from Excel or Google Sheets, or choose a CSV file. Names that already exist are skipped, so you can import the same list twice safely.</p>
      <div className="mb-2 flex flex-wrap gap-2">
        <select className="a-input" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="labourers">Labourers</option>
          <option value="contractors">Contractors</option>
          <option value="companies">Companies / vendors</option>
        </select>
        {kind !== 'companies' && (
          <select className="a-input" value={unit} onChange={(e) => setUnit(e.target.value as AdminUnit)}>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        )}
        <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <pre className="mb-2 whitespace-pre-wrap rounded bg-gray-100 p-2 text-xs text-gray-700">{HELP[kind]}</pre>
      <textarea className="a-input h-64 w-full font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste here" />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="a-btn" disabled={busy || preview.length === 0} onClick={() => void go()}>Import {preview.length} rows{kind !== 'companies' ? ` into ${UNITS.find((u) => u.id === unit)?.name}` : ''}</button>
        {result && <span className={result.startsWith('Error') ? 'text-red-700' : 'text-green-700'}>{result}</span>}
      </div>
    </div>
  )
}
