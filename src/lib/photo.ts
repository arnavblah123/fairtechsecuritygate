import imageCompression from 'browser-image-compression'
import { db } from './db'
import { api } from './http'

/** Compress a captured image to ~200 KB JPEG, max 1280 px on the long side. */
export async function compressPhoto(file: File | Blob): Promise<Blob> {
  const f = file instanceof File ? file : new File([file], 'photo.jpg', { type: file.type || 'image/jpeg' })
  return imageCompression(f, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  })
}

/** Storage path for a new photo. Always starts with the unit id (RLS depends on it). */
export function newPhotoPath(unitId: string, register: string): string {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return `${unitId}/${register}/${ym}/${crypto.randomUUID()}.jpg`
}

/** Save a photo locally (survives reloads) so it can be shown before/while it syncs. */
export async function storePhotoLocally(path: string, blob: Blob, keep = false) {
  await db.photos.put({ path, blob, savedAt: new Date().toISOString(), keep: keep ? 1 : 0 })
}

const urlCache = new Map<string, string>()

/** Object URL for a photo path: local blob first, else download via signed URL and cache the blob. */
export async function photoUrl(path: string | null | undefined, keep = false): Promise<string | null> {
  if (!path) return null
  const cached = urlCache.get(path)
  if (cached) return cached
  const local = await db.photos.get(path)
  if (local) {
    const u = URL.createObjectURL(local.blob)
    urlCache.set(path, u)
    return u
  }
  if (!navigator.onLine) return null
  try {
    const blob = await api.blob(`/api/photos/${path}`)
    await storePhotoLocally(path, blob, keep)
    const u = URL.createObjectURL(blob)
    urlCache.set(path, u)
    return u
  } catch {
    return null
  }
}

/** Drop cached entry photos older than 7 days. Labourer photos (keep=1) stay. */
export async function prunePhotoCache() {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString()
  const pending = new Set((await db.outbox.toArray()).map((o) => o.path).filter(Boolean))
  const old = await db.photos.where('savedAt').below(cutoff).toArray()
  for (const p of old) {
    if (p.keep || pending.has(p.path)) continue
    await db.photos.delete(p.path)
    const u = urlCache.get(p.path)
    if (u) { URL.revokeObjectURL(u); urlCache.delete(p.path) }
  }
}
