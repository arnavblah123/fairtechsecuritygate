// Photo storage. Production: any S3-compatible bucket (Backblaze B2). Local dev: a folder.
import { AwsClient } from 'aws4fetch'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface Storage {
  put(path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<void>
  get(path: string): Promise<{ bytes: Uint8Array<ArrayBuffer>; contentType: string } | null>
  delete(path: string): Promise<void>
}

function s3(): Storage {
  const endpoint = process.env.S3_ENDPOINT!.replace(/\/$/, '')
  const bucket = process.env.S3_BUCKET!
  const client = new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    service: 's3',
    region: process.env.S3_REGION || 'us-east-1',
  })
  const url = (path: string) => `${endpoint}/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
  return {
    async put(path, bytes, contentType) {
      const res = await client.fetch(url(path), { method: 'PUT', body: bytes, headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength) } })
      if (!res.ok) throw new Error(`storage put ${res.status}: ${(await res.text()).slice(0, 200)}`)
    },
    async get(path) {
      const res = await client.fetch(url(path), { method: 'GET' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`storage get ${res.status}`)
      return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get('content-type') || 'image/jpeg' }
    },
    async delete(path) {
      const res = await client.fetch(url(path), { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error(`storage delete ${res.status}`)
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
  instance = process.env.STORAGE_DIR ? local(process.env.STORAGE_DIR) : s3()
  return instance
}

/** unit/register/yyyy-mm/uuid.jpg */
export const PHOTO_PATH = /^(dehu|savli)\/[a-z_]{1,20}\/\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/
