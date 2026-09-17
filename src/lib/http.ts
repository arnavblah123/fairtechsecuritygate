// Small fetch wrapper for the /api backend. Tokens live in localStorage.
export class ApiError extends Error {
  constructor(public status: number, public code: string, public detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

const GUARD_TOKEN = 'gate.token'
const ADMIN_TOKEN = 'gate.admin_token'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* ignore */ }
}

export const guardToken = { get: () => read(GUARD_TOKEN), set: (v: string | null) => write(GUARD_TOKEN, v) }
export const adminToken = { get: () => read(ADMIN_TOKEN), set: (v: string | null) => write(ADMIN_TOKEN, v) }

/** Token for the current side of the app: admin pages use the admin token, everything else the guard token. */
export function currentToken(): string | null {
  return location.pathname.startsWith('/admin') ? adminToken.get() : guardToken.get()
}

interface Opts { body?: unknown; token?: string | null; raw?: boolean }

export async function request<T = unknown>(method: string, path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = opts.token === undefined ? currentToken() : opts.token
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (opts.body instanceof Blob) { body = opts.body; headers['Content-Type'] = opts.body.type || 'image/jpeg' }
  else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['Content-Type'] = 'application/json' }
  const res = await fetch(path, { method, headers, body })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
    throw new ApiError(res.status, j.error ?? `http_${res.status}`, j.detail)
  }
  if (opts.raw) return res as unknown as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, { token }),
  post: <T>(path: string, body?: unknown, token?: string | null) => request<T>('POST', path, { body, token }),
  patch: <T>(path: string, body?: unknown, token?: string | null) => request<T>('PATCH', path, { body, token }),
  putBlob: (path: string, blob: Blob, token?: string | null) => request<{ ok: true }>('PUT', path, { body: blob, token }),
  blob: async (path: string, token?: string | null) => (await request<Response>('GET', path, { raw: true, token })).blob(),
}

export function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) return e.status >= 500
  return !navigator.onLine || e instanceof TypeError || /fetch|network|Load failed|timeout/i.test(String((e as Error)?.message ?? e))
}
