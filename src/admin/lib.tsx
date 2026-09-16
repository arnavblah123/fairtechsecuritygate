import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const UNITS = [
  { id: 'dehu', name: 'Dehu (Pune)' },
  { id: 'savli', name: 'Savli (Baroda)' },
] as const
export type AdminUnit = (typeof UNITS)[number]['id']

export function useUnit(): [AdminUnit, (u: AdminUnit) => void] {
  const [u, setU] = useState<AdminUnit>(() => (localStorage.getItem('admin.unit') as AdminUnit) || 'dehu')
  return [u, (n) => { localStorage.setItem('admin.unit', n); setU(n) }]
}

export function UnitTabs({ unit, onChange }: { unit: AdminUnit; onChange: (u: AdminUnit) => void }) {
  return (
    <div className="mb-3 flex gap-2">
      {UNITS.map((u) => (
        <button key={u.id} type="button" onClick={() => onChange(u.id)} className={`rounded px-3 py-1 font-semibold ${unit === u.id ? 'bg-blue-700 text-white' : 'bg-gray-200'}`}>{u.name}</button>
      ))}
    </div>
  )
}

/** Signed URL for admin photo previews (no local caching needed). */
export function useSignedUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (!path) return
    void supabase.storage.from('photos').createSignedUrl(path, 3600).then(({ data }) => { if (alive && data) setUrl(data.signedUrl) })
    return () => { alive = false }
  }, [path])
  return url
}

export function Thumb({ path, size = 48 }: { path: string | null | undefined; size?: number }) {
  const url = useSignedUrl(path)
  return url ? <img src={url} alt="" style={{ width: size, height: size }} className="rounded object-cover" /> : <div style={{ width: size, height: size }} className="rounded bg-gray-200" />
}

export function errMsg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e)
}
