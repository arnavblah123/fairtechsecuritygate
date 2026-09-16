import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, kvGet, kvSet } from './db'
import { supabase, PHOTOS_BUCKET } from './supabase'
import { istDayStart } from './time'
import { prunePhotoCache } from './photo'
import type { Contractor, Labourer, LabourMovement, OutboxItem } from './types'

export type SyncState = 'idle' | 'syncing' | 'offline' | 'auth' | 'error'

let running = false
let listeners = new Set<(s: SyncState) => void>()
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

function isNetworkError(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '')
  return !navigator.onLine || /fetch|network|Failed to fetch|Load failed|timeout/i.test(msg)
}

/** Returns 'ok' | 'permanent' | 'transient' | 'auth' */
async function runItem(item: OutboxItem): Promise<{ result: 'ok' | 'permanent' | 'transient' | 'auth'; error?: string }> {
  try {
    if (item.kind === 'upload') {
      const photo = await db.photos.get(item.path!)
      if (!photo) return { result: 'permanent', error: 'photo missing on phone' }
      const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(item.path!, photo.blob, { contentType: 'image/jpeg', upsert: false })
      if (error) {
        const msg = error.message || ''
        const status = (error as { statusCode?: string | number }).statusCode
        if (/already exists|Duplicate/i.test(msg) || String(status) === '409') return { result: 'ok' }
        if (String(status) === '401' || /jwt|token/i.test(msg)) return { result: 'auth', error: msg }
        if (isNetworkError(error)) return { result: 'transient', error: msg }
        return { result: 'permanent', error: msg }
      }
      return { result: 'ok' }
    }
    if (item.kind === 'insert') {
      const { error } = await supabase.from(item.table!).insert(item.payload!)
      if (error) {
        if (error.code === '23505') return { result: 'ok' } // already there
        if (error.code === 'PGRST301' || /jwt|token/i.test(error.message)) return { result: 'auth', error: error.message }
        if (isNetworkError(error)) return { result: 'transient', error: error.message }
        return { result: 'permanent', error: `${error.code ?? ''} ${error.message}` }
      }
      return { result: 'ok' }
    }
    if (item.kind === 'rpc') {
      const { error } = await supabase.rpc(item.fn!, item.payload!)
      if (error) {
        if (error.code === 'PGRST301' || /jwt|token/i.test(error.message)) return { result: 'auth', error: error.message }
        if (isNetworkError(error)) return { result: 'transient', error: error.message }
        return { result: 'permanent', error: `${error.code ?? ''} ${error.message}` }
      }
      return { result: 'ok' }
    }
    return { result: 'permanent', error: 'unknown item' }
  } catch (e) {
    if (isNetworkError(e)) return { result: 'transient', error: String((e as Error).message) }
    return { result: 'permanent', error: String((e as Error).message ?? e) }
  }
}

async function afterSuccess(item: OutboxItem) {
  if (item.kind === 'insert' && item.table === 'labour_movements') {
    await db.movements.update(item.id, { pending: 0 })
  }
}

/** Push queued items in order. Stops at the first transient failure to keep ordering. */
export async function processOutbox(): Promise<void> {
  if (running) return
  if (!navigator.onLine) { setState('offline'); return }
  running = true
  setState('syncing')
  let final: SyncState = 'idle'
  try {
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) { final = 'auth'; return }
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

/** Pull reference data + today's entries for the unit into the local cache. */
export async function refreshCaches(unitId: string): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const [lab, con, mov, inside, mistakes, counts] = await Promise.all([
      supabase.from('labourers').select('id, unit_id, name, contractor_id, photo_path, status, updated_at').eq('unit_id', unitId).in('status', ['approved', 'pending']),
      supabase.from('contractors').select('id, unit_id, name, active').eq('unit_id', unitId).eq('active', true),
      supabase.from('labour_movements').select('id, unit_id, labourer_id, direction, at, device_at, guard_id, carrying_photo_path, voided_at, void_reason').eq('unit_id', unitId).gte('at', istDayStart()).order('at', { ascending: false }).limit(1000),
      supabase.from('labour_inside').select('id, unit_id, labourer_id, direction, at, carrying_photo_path').eq('unit_id', unitId),
      supabase.from('mistake_reports').select('id, entry_id, register, reason, at').eq('unit_id', unitId).gte('at', istDayStart()),
      supabase.from('inside_counts').select('labour, visitors, vehicles').eq('unit_id', unitId).maybeSingle(),
    ])
    if (lab.error || con.error || mov.error || inside.error || mistakes.error) return false

    const pendingLabourerIds = new Set((await db.outbox.where('status').anyOf('pending', 'error').toArray()).filter((o) => o.table === 'labourers').map((o) => o.id))
    const contractors = con.data as Contractor[]
    const cname = new Map(contractors.map((c) => [c.id, c.name]))
    const labourers: Labourer[] = (lab.data as Labourer[]).map((l) => ({ ...l, contractor_name: l.contractor_id ? cname.get(l.contractor_id) ?? null : null }))

    await db.transaction('rw', [db.labourers, db.contractors, db.movements, db.mistakes], async () => {
      const keepLocal = await db.labourers.filter((l) => pendingLabourerIds.has(l.id)).toArray()
      await db.labourers.clear()
      await db.labourers.bulkPut([...labourers, ...keepLocal])
      await db.contractors.clear()
      await db.contractors.bulkPut(contractors)
      const pendingMov = await db.movements.where('pending').equals(1).toArray()
      await db.movements.clear()
      const rows: LabourMovement[] = [
        ...(inside.data as LabourMovement[]).map((m) => ({ ...m, pending: 0 })),
        ...(mov.data as LabourMovement[]).map((m) => ({ ...m, pending: 0 })),
      ]
      await db.movements.bulkPut(rows)
      await db.movements.bulkPut(pendingMov)
      await db.mistakes.clear()
      await db.mistakes.bulkPut(mistakes.data ?? [])
    })
    await kvSet('cache.refreshedAt', new Date().toISOString())
    await kvSet('cache.unit', unitId)
    if (counts.data) await kvSet('inside.counts', { visitors: Number(counts.data.visitors ?? 0), vehicles: Number(counts.data.vehicles ?? 0) })
    void prunePhotoCache()
    return true
  } catch {
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
