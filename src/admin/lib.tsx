import { useEffect, useState } from 'react'
import { adminToken, api } from '../lib/http'

export const UNITS = [
  { id: 'dehu', name: 'Dehu (Pune)' },
  { id: 'savli', name: 'Savli (Baroda)' },
] as const
export type AdminUnit = (typeof UNITS)[number]['id']

export const admin = {
  get: <T,>(path: string) => api.get<T>(path, adminToken.get()),
  post: <T,>(path: string, body?: unknown) => api.post<T>(path, body, adminToken.get()),
  patch: <T,>(path: string, body?: unknown) => api.patch<T>(path, body, adminToken.get()),
  putBlob: (path: string, blob: Blob) => api.putBlob(path, blob, adminToken.get()),
  blob: (path: string) => api.blob(path, adminToken.get()),
}

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

const urlCache = new Map<string, string>()

/** Object URL for an admin photo preview (fetched through the API with the admin token). */
export function usePhoto(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    if (!path) return
    const cached = urlCache.get(path)
    if (cached) { setUrl(cached); return }
    void admin.blob(`/api/photos/${path}`).then((b) => {
      const u = URL.createObjectURL(b)
      urlCache.set(path, u)
      if (alive) setUrl(u)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [path])
  return url
}

export function Thumb({ path, size = 48 }: { path: string | null | undefined; size?: number }) {
  const url = usePhoto(path)
  return url ? <img src={url} alt="" style={{ width: size, height: size }} className="rounded object-cover" /> : <div style={{ width: size, height: size }} className="rounded bg-gray-200" />
}

export function errMsg(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e)
}
