// Database access. Production: Neon over HTTP. Local dev/tests: PGlite (in-process Postgres).
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Row = Record<string, unknown>
export interface Db {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>
}

let instance: Db | null = null
let ready: Promise<Db> | null = null

async function createDb(): Promise<Db> {
  const pgliteDir = process.env.PGLITE_DIR
  if (pgliteDir !== undefined) {
    const modName = '@electric-sql/pglite' // variable so bundlers do not try to include it in production
    const { PGlite } = (await import(/* @vite-ignore */ modName)) as typeof import('@electric-sql/pglite')
    if (pgliteDir) mkdirSync(pgliteDir, { recursive: true })
    const pg = new PGlite(pgliteDir || undefined)
    await pg.waitReady
    await pg.exec(readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8'))
    return { query: async <T,>(text: string, params?: unknown[]) => (await pg.query<T>(text, params)).rows }
  }
  const url = process.env.GATE_DATABASE_URL || process.env.DATABASE_URL
  if (!url) throw new Error('GATE_DATABASE_URL is not set')
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)
  return { query: async <T,>(text: string, params?: unknown[]) => (await sql.query(text, params ?? [])) as T[] }
}

export function db(): Promise<Db> {
  if (instance) return Promise.resolve(instance)
  ready ??= createDb().then((d) => (instance = d))
  return ready
}

export const isUuid = (s: unknown): s is string =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** Build "insert ... on conflict (id) do nothing" from a whitelisted column map. */
export function insertSql(table: string, row: Record<string, unknown>): { text: string; params: unknown[] } {
  const cols = Object.keys(row)
  const params = cols.map((c) => row[c])
  const text = `insert into ${table} (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) on conflict (id) do nothing`
  return { text, params }
}

/** Build "update t set a=$1, b=$2 where id=$n" from a whitelisted column map. */
export function updateSql(table: string, id: string, patch: Record<string, unknown>): { text: string; params: unknown[] } | null {
  const cols = Object.keys(patch)
  if (cols.length === 0) return null
  const params = cols.map((c) => patch[c])
  params.push(id)
  return { text: `update ${table} set ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} where id = $${params.length}`, params }
}

/** Keep only allowed keys. */
export function pick(obj: unknown, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (obj && typeof obj === 'object') for (const k of keys) if (k in (obj as object)) out[k] = (obj as Record<string, unknown>)[k]
  return out
}
