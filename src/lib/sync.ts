import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kvGet, kvSet } from './db'
import { api, ApiError, guardToken, isNetworkError } from './http'
import { prunePhotoCache } from './photo'
import type { Contractor, Labourer, LabourMovement, OutboxItem } from './types'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'auth' | 'error'

let running = false
const listeners = new Set<(s: SyncState) => void>()
let state: SyncState = 'idle'
function setState(s: SyncState) {
  state = s
  listeners.forEach((l) => l(s))
}

export async function enqueue(items: Omit<OutboxItem, 'seq' | 'status' | 'attempts' | 'createdAt'>[]) {
  const now = new Date().toISOString()
  await db.outbox.bulkAdd(items.map((i) => ({ ...i, status: 'pending' as const, attempts: 0, createdAt: now })))
  void processOutbox()
}

type Result = { result: 'ok' | 'permanent' | 'transient' | 'auth'; error?: string }

function classify(e: unknown): Result {
  if (e instanceof ApiError) {
    if (e.status === 401) return { result: 'auth', error: e.message }
    if (e.status >= 500) return { result: 'transient', error: e.message }
    return { result: 'permanent', error: e.message }
  }
  if (isNetworkError(e)) return { result: 'transient', error: String((e as Error).message ?? e) }
  return { result: 'permanent', error: String((e as Error).message ?? e) }
}

async function runItem(item: OutboxItem): Promise<Result> {
  try {
    const token = guardToken.get()
    if (item.kind === 'upload') {
      const photo = await db.photos.get(item.path!)
      if (!photo) return { result: 'permanent', error: 'photo missing on phone' }
      await api.putBlob(`/api/photos/${item.path}`, photo.blob, token)
    } else if (item.kind === 'insert') {
      await api.post('/api/guard/entries', { table: item.table, row: item.payload }, token)
    } else if (item.kind === 'rpc') {
      await api.post(`/api/guard/rpc/${item.fn}`, item.payload, token)
    } else {
      return { result: 'permanent', error: 'unknown item' }
    }
    return { result: 'ok' }
  } catch (e) {
    return classify(e)
  }
}

async function afterSuccess(item: OutboxItem) {
  if (item.kind === 'insert' && item.table === 'labour_movements') await db.movements.update(item.id, { pending: 0 })
}

/** Push queued items in order. Stops at the first transient failure to keep ordering. */
export async function processOutbox(): Promise<void> {
  if (running) return
  if (!navigator.onLine) { setState('offline'); return }
  running = true
  setState('syncing')
  let final: SyncState = 'idle'
  try {
    if (!guardToken.get()) { final = 'auth'; return }
    const items = await db.outbox.where('status').equals('pending').sortBy('seq')
    for (const item of items) {
      const r = await runItem(item)
      if (r.result === 'ok') {
        await afterSuccess(item)
        await db.outbox.delete(item.seq!)
      } else if (r.result === 'permanent') {
        await db.outbox.update(item.seq!, { status: 'error', attempts: item.attempts + 1, lastError: r.error })
      } else {
        await db.outbox.update(item.seq!, { attempts: item.attempts + 1, lastError: r.error })
        final = r.result === 'auth' ? 'auth' : 'offline'
        break
      }
    }
    if (final === 'idle') {
      const errors = await db.outbox.where('status').equals('error').count()
      if (errors > 0) final = 'error'
      await kvSet('sync.lastAt', new Date().toISOString())
    }
  } finally {
    running = false
    setState(final)
  }
}

/** Retry items that hit a permanent error (after admin fixed something). */
export async function retryErrors() {
  await db.outbox.where('status').equals('error').modify({ status: 'pending' })
  await processOutbox()
}

interface Bootstrap {
  labourers: Labourer[]
  contractors: Contractor[]
  movements: LabourMovement[]
  inside: LabourMovement[]
  mistakes: { id: string; entry_id: string; register: string; reason: string; at: string }[]
  counts: { labour: number; visitors: number; vehicles: number }
  token?: string
}

/** Pull reference data + today's entries for the unit into the local cache. */
export async function refreshCaches(unitId: string): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const b = await api.get<Bootstrap>('/api/guard/bootstrap', guardToken.get())
    if (b.token) guardToken.set(b.token)
    const pendingLabourerIds = new Set((await db.outbox.where('status').anyOf('pending', 'error').toArray()).filter((o) => o.table === 'labourers').map((o) => o.id))
    await db.transaction('rw', [db.labourers, db.contractors, db.movements, db.mistakes], async () => {
      const keepLocal = await db.labourers.filter((l) => pendingLabourerIds.has(l.id)).toArray()
      await db.labourers.clear()
      await db.labourers.bulkPut([...b.labourers, ...keepLocal])
      await db.contractors.clear()
      await db.contractors.bulkPut(b.contractors)
      const pendingMov = await db.movements.where('pending').equals(1).toArray()
      await db.movements.clear()
      await db.movements.bulkPut([...b.inside, ...b.movements].map((m) => ({ ...m, pending: 0 })))
      await db.movements.bulkPut(pendingMov)
      await db.mistakes.clear()
      await db.mistakes.bulkPut(b.mistakes)
    })
    await kvSet('cache.refreshedAt', new Date().toISOString())
    await kvSet('cache.unit', unitId)
    await kvSet('inside.counts', { visitors: Number(b.counts.visitors ?? 0), vehicles: Number(b.counts.vehicles ?? 0) })
    void prunePhotoCache()
    return true
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) setState('auth')
    return false
  }
}

export function useSyncState() {
  const [s, setS] = useState<SyncState>(state)
  useEffect(() => {
    listeners.add(setS)
    return () => { listeners.delete(setS) }
  }, [])
  return s
}

export function usePendingCount(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0) ?? 0
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/** Mount once in the guard app: sync on reconnect, on focus, and every 30 s while items are queued. */
export function useBackgroundSync(unitId: string | null) {
  useEffect(() => {
    if (!unitId) return
    const kick = () => { void processOutbox().then(() => refreshCaches(unitId)) }
    kick()
    window.addEventListener('online', kick)
    const vis = () => { if (document.visibilityState === 'visible') kick() }
    document.addEventListener('visibilitychange', vis)
    const t = setInterval(async () => {
      const n = await db.outbox.where('status').equals('pending').count()
      if (n > 0) void processOutbox()
      else {
        const last = await kvGet<string>('cache.refreshedAt')
        if (!last || Date.now() - new Date(last).getTime() > 5 * 60_000) void refreshCaches(unitId)
      }
    }, 30_000)
    return () => {
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', vis)
      clearInterval(t)
    }
  }, [unitId])
}
