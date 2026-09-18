// One-way mirror of the production app's Employee table into labourers.
// Production is the master for people; the gate app keeps photos, status of
// gate-created people, and all movements locally.
import { db, type Row } from './db.js'

export const PRODUCTION_URL_ENV = 'GATE_PRODUCTION_DATABASE_URL'
const UNIT_BY_CODE: Record<string, string | null> = { DH2: 'dehu', SV3: 'savli', CH1: null }
const MIN_INTERVAL_MS = 60 * 60_000

export interface ProdEmployee { code: string; name: string; skill: string | null; active: boolean; unit_code: string }
type ProdQuery = () => Promise<ProdEmployee[]>

async function defaultProdQuery(): Promise<ProdEmployee[]> {
  const url = process.env[PRODUCTION_URL_ENV]
  if (!url) throw new Error(`${PRODUCTION_URL_ENV} is not set`)
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  return (await sql.query(
    `select e.code, e.name, e.skill, e.active, u.code as unit_code
     from "Employee" e join "Unit" u on u.id = e."primaryUnitId"`, [])) as ProdEmployee[]
}

export function productionConfigured(): boolean {
  return Boolean(process.env[PRODUCTION_URL_ENV])
}

export interface SyncResult { ran: boolean; reason?: string; added: number; updated: number; linked: number; total: number; at?: string; error?: string }

export async function getSyncStatus(): Promise<{ configured: boolean; lastAt: string | null; lastResult: string | null }> {
  const q = await db()
  const rows = await q.query<{ key: string; value: string }>("select key, value from settings where key in ('prodsync.lastAt', 'prodsync.lastResult')")
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? null
  return { configured: productionConfigured(), lastAt: get('prodsync.lastAt'), lastResult: get('prodsync.lastResult') }
}

/** Runs at most once an hour unless force = true. Never throws: errors are returned and stored. */
export async function syncFromProduction(opts: { force?: boolean; prodQuery?: ProdQuery } = {}): Promise<SyncResult> {
  const q = await db()
  const none: SyncResult = { ran: false, added: 0, updated: 0, linked: 0, total: 0 }
  if (!opts.prodQuery && !productionConfigured()) return { ...none, reason: 'not_configured' }
  if (!opts.force) {
    const [last] = await q.query<{ value: string }>("select value from settings where key = 'prodsync.lastAt'")
    if (last && Date.now() - new Date(last.value).getTime() < MIN_INTERVAL_MS) return { ...none, reason: 'recent' }
  }
  const setSetting = (key: string, value: string) => q.query('insert into settings (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated_at = now()', [key, value])
  try {
    const employees = await (opts.prodQuery ?? defaultProdQuery)()
    let added = 0, updated = 0, linked = 0
    const existing = await q.query<Row>('select id, unit_id, name, status, external_code, skill from labourers')
    const byCode = new Map(existing.filter((l) => l.external_code).map((l) => [l.external_code as string, l]))
    const unlinked = existing.filter((l) => !l.external_code)
    for (const e of employees) {
      if (!e.code || !e.name?.trim()) continue
      const gateUnit = UNIT_BY_CODE[e.unit_code]
      const unit = gateUnit ?? 'dehu' // units without a gate are kept under Dehu, inactive
      const status = e.active && gateUnit ? 'approved' : 'inactive'
      const name = e.name.trim()
      const skill = e.skill?.trim() || null
      const current = byCode.get(e.code)
      if (current) {
        if (current.name !== name || current.unit_id !== unit || current.status !== status || (current.skill ?? null) !== skill) {
          await q.query('update labourers set name = $2, unit_id = $3, status = $4, skill = $5 where id = $1', [current.id, name, unit, status, skill])
          updated++
        }
        continue
      }
      const match = unlinked.find((l) => l.unit_id === unit && (l.name as string).trim().toLowerCase() === name.toLowerCase())
      if (match) {
        await q.query('update labourers set external_code = $2, name = $3, status = $4, skill = $5 where id = $1', [match.id, e.code, name, status, skill])
        unlinked.splice(unlinked.indexOf(match), 1)
        byCode.set(e.code, { ...match, external_code: e.code })
        linked++
        continue
      }
      await q.query('insert into labourers (id, unit_id, name, status, external_code, skill) values ($1, $2, $3, $4, $5, $6)', [crypto.randomUUID(), unit, name, status, e.code, skill])
      added++
    }
    const at = new Date().toISOString()
    const result: SyncResult = { ran: true, added, updated, linked, total: employees.length, at }
    await setSetting('prodsync.lastAt', at)
    await setSetting('prodsync.lastResult', `${employees.length} employees: ${added} added, ${updated} updated, ${linked} linked`)
    return result
  } catch (e) {
    const error = String((e as Error).message ?? e)
    await setSetting('prodsync.lastResult', `Error: ${error}`)
    return { ...none, error }
  }
}
