// Photo storage. Production: Vercel Blob (private store). Local dev: a folder.
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface Storage {
  put(path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>
  get(path: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null>
  delete(path: string): Promise<void>
}

function vercelBlob(): Storage {
  const sdk = import('@vercel/blob')
  return {
    async put(path, bytes, contentType) {
      const { put } = await sdk
      await put(path, new Blob([bytes], { type: contentType }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType })
    },
    async get(path) {
      const { get } = await sdk
      const r = await get(path, { access: 'private' })
      if (!r || !r.stream) return null
      return { bytes: new Uint8Array(await new Response(r.stream).arrayBuffer()), contentType: r.blob.contentType || 'image/jpeg' }
    },
    async delete(path) {
      const { del } = await sdk
      await del(path)
    },
  }
}

function local(dir: string): Storage {
  const full = (path: string) => join(dir, path)
  return {
    async put(path, bytes) {
      await mkdir(dirname(full(path)), { recursive: true })
      await writeFile(full(path), bytes)
    },
    async get(path) {
      try { return { bytes: Uint8Array.from(await readFile(full(path))), contentType: 'image/jpeg' } } catch { return null }
    },
    async delete(path) {
      try { await unlink(full(path)) } catch { /* gone */ }
    },
  }
}

let instance: Storage | null = null
export function storage(): Storage {
  if (instance) return instance
  if (process.env.STORAGE_DIR) instance = local(process.env.STORAGE_DIR)
  else if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) instance = vercelBlob()
  else throw new Error('No photo storage configured: connect a Vercel Blob store to this project (adds BLOB_READ_WRITE_TOKEN).')
  return instance
}

/** unit/register/yyyy-mm/uuid.jpg */
export const PHOTO_PATH = /^(dehu|savli)\/[a-z_]{1,20}\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
