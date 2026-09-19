import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { db, insertSql, isUuid, pick, updateSql, type Row } from './db.js'
import { storage, PHOTO_PATH } from './storage.js'
import { requireRole, signToken, type Env, type GuardClaims } from './auth.js'
import { IST_DAY_START } from './time.js'
import { backfillNativeNames, getSyncStatus, productionConfigured, syncFromProduction } from './prodsync.js'
import { nativeName } from './translit.js'

export const app = new Hono<Env>().basePath('/api')

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'server', detail: String(err.message ?? err) }, 500)
})

const UNITS = ['dehu', 'savli']
const VISITOR_PURPOSES = ['client', 'supplier', 'transporter', 'government', 'interview', 'other']
const ID_TYPES = ['aadhaar', 'dl', 'company_id', 'none']
const VEHICLE_TYPES = ['truck', 'tempo', 'trailer', 'car', 'bike', 'crane_hydra']
const VEHICLE_PURPOSES = ['material_in', 'material_out', 'scrap_out', 'empty', 'visitor']
/** Number plate as stored: upper case, letters and digits only. */
const normalizePlate = (p: unknown) => (typeof p === 'string' ? p.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')

// ---------------------------------------------------------------------------
// Health: open /api/health in a browser to see what is configured and whether the database answers.
// ---------------------------------------------------------------------------
app.get('/health', async (c) => {
  const jwt = process.env.GATE_JWT_SECRET || process.env.JWT_SECRET
  const config = {
    DATABASE_URL: Boolean(process.env.GATE_DATABASE_URL || process.env.DATABASE_URL || process.env.PGLITE_DIR !== undefined),
    JWT_SECRET: Boolean(jwt && jwt.length >= 16),
    PRODUCTION_LINK: productionConfigured(),
    BLOB_STORE: Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN || process.env.STORAGE_DIR),
  }
  let database = 'ok'
  let admins: number | null = null
  try {
    const q = await db()
    const [row] = await q.query<{ n: number }>('select count(*)::int as n from admin_users')
    admins = Number(row?.n ?? 0)
  } catch (e) {
    database = String((e as Error).message ?? e)
  }
  const ok = config.DATABASE_URL && config.JWT_SECRET && database === 'ok'
  return c.json({ ok, config, database, admins, hint: !config.DATABASE_URL ? 'Add GATE_DATABASE_URL in Vercel → Settings → Environment Variables, then redeploy.'
    : !config.JWT_SECRET ? 'Add GATE_JWT_SECRET (16+ characters) in Vercel → Settings → Environment Variables, then redeploy.'
    : database !== 'ok' ? 'Database error. If it says a table does not exist, run db/schema.sql in the Neon SQL editor.'
    : !config.BLOB_STORE ? 'Photos will fail until a Vercel Blob store is connected (Storage → Create → Blob), then redeploy.'
    : !config.PRODUCTION_LINK ? 'Optional: add GATE_PRODUCTION_DATABASE_URL to mirror labourers from the production app.' : 'All good.' }, ok ? 200 : 500)
})
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Guard: login
// ---------------------------------------------------------------------------
app.post('/guard/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { device_id?: string; unit_id?: string; pin?: string; device_label?: string }
  const { device_id, pin } = body
  if (!isUuid(device_id) || !pin || !/^\d{4}$/.test(pin)) return c.json({ error: 'bad_request' }, 400)
  const q = await db()

  const [device] = await q.query('select * from devices where id = $1', [device_id])
  let unitId: string
  if (device) {
    if (!device.active) return c.json({ error: 'device_disabled' }, 403)
    if (device.locked_until && new Date(device.locked_until as string) > new Date()) return c.json({ error: 'locked' }, 429)
    unitId = device.unit_id as string
  } else {
    if (!body.unit_id || !UNITS.includes(body.unit_id)) return c.json({ error: 'unit_required' }, 400)
    unitId = body.unit_id
  }

  const guards = await q.query('select id, name, language, pin_hash from guards where unit_id = $1 and active and pin_hash is not null', [unitId])
  let guard: Row | undefined
  for (const g of guards) if (await bcrypt.compare(pin, g.pin_hash as string)) { guard = g; break }
  if (!guard) {
    if (device) {
      const attempts = Number(device.failed_attempts ?? 0) + 1
      const lock = attempts >= MAX_ATTEMPTS
      await q.query('update devices set failed_attempts = $2, locked_until = $3 where id = $1',
        [device_id, lock ? 0 : attempts, lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null])
      if (lock) return c.json({ error: 'locked' }, 429)
    }
    await sleep(800)
    return c.json({ error: 'bad_pin' }, 401)
  }

  if (device) {
    await q.query('update devices set last_seen_at = now(), last_guard_id = $2, failed_attempts = 0, locked_until = null where id = $1', [device_id, guard.id])
  } else {
    await q.query('insert into devices (id, unit_id, label, last_seen_at, last_guard_id) values ($1, $2, $3, now(), $4) on conflict (id) do nothing',
      [device_id, unitId, (body.device_label ?? '').slice(0, 120) || null, guard.id])
  }
  const [unit] = await q.query('select id, name, default_language, unit_head_name, unit_head_phone from units where id = $1', [unitId])
  const token = await signToken({ role: 'guard', unit_id: unitId, guard_id: guard.id as string, device_id })
  return c.json({ token, guard: { id: guard.id, name: guard.name, language: guard.language }, unit })
})

// ---------------------------------------------------------------------------
// Guard: everything the phone caches, in one call
// ---------------------------------------------------------------------------
app.get('/guard/bootstrap', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims & { exp: number }
  const q = await db()
  const u = a.unit_id
  await syncFromProduction() // at most once an hour; never throws
  await backfillNativeNames()
  const [labourers, contractors, movements, inside, mistakes, counts, unit, staff, companies, visitors, vehicles, blacklist] = await Promise.all([
    q.query(`select l.id, l.unit_id, l.name, l.name_hi, l.contractor_id, c.name as contractor_name, l.photo_path, l.status, l.skill, l.external_code, l.updated_at
             from labourers l left join contractors c on c.id = l.contractor_id
             where l.unit_id = $1 and l.status in ('approved','pending') order by l.name`, [u]),
    q.query('select id, unit_id, name, active from contractors where unit_id = $1 and active order by name', [u]),
    q.query(`select id, unit_id, labourer_id, direction, at, device_at, guard_id, carrying_photo_path, voided_at, void_reason, flag
             from labour_movements where unit_id = $1 and at >= ${IST_DAY_START} order by at desc limit 1000`, [u]),
    q.query('select id, unit_id, labourer_id, direction, at, device_at, guard_id, carrying_photo_path, flag from labour_inside where unit_id = $1', [u]),
    q.query(`select id, entry_id, register, reason, at from mistake_reports where unit_id = $1 and at >= ${IST_DAY_START}`, [u]),
    q.query('select labour, visitors, vehicles from inside_counts where unit_id = $1', [u]),
    q.query('select id, name, default_language, unit_head_name, unit_head_phone from units where id = $1', [u]),
    q.query('select id, unit_id, name, phone, sort_order from staff where unit_id = $1 and active order by sort_order, name', [u]),
    q.query('select id, unit_id, name, category from companies where (unit_id = $1 or unit_id is null) and active order by name', [u]),
    q.query(`select id, unit_id, name, company, purpose, meeting_staff_id, meeting_name, persons, id_type, photo_path, in_at, in_guard_id, out_at, out_guard_id, device_at, voided_at, void_reason
             from visitors where unit_id = $1 and ((out_at is null and voided_at is null) or in_at >= ${IST_DAY_START} or out_at >= ${IST_DAY_START}) order by in_at desc limit 500`, [u]),
    q.query(`select id, unit_id, plate, vehicle_type, purpose, driver_name, plate_photo_path, challan_photo_path, loaded_photo_path, gatepass_photo_path, in_at, in_guard_id, out_at, out_guard_id, out_loaded, out_loaded_photo_path, device_at, voided_at, void_reason
             from vehicles where unit_id = $1 and ((out_at is null and voided_at is null) or in_at >= ${IST_DAY_START} or out_at >= ${IST_DAY_START}) order by in_at desc limit 500`, [u]),
    q.query('select id, kind, labourer_id, name, plate, reason from blacklist where active and (unit_id = $1 or unit_id is null)', [u]),
  ])
  // Refresh the token when it is within 7 days of expiry.
  const token = a.exp - Date.now() / 1000 < 7 * 24 * 3600 ? await signToken({ role: 'guard', unit_id: a.unit_id, guard_id: a.guard_id, device_id: a.device_id }) : undefined
  return c.json({ labourers, contractors, movements, inside, mistakes, counts: counts[0] ?? { labour: 0, visitors: 0, vehicles: 0 }, unit: unit[0], token, staff, companies, visitors, vehicles, blacklist })
})

// ---------------------------------------------------------------------------
// Guard: insert-only entries. Columns are whitelisted; unit and guard come from the token.
// ---------------------------------------------------------------------------
const ENTRY_COLUMNS: Record<string, string[]> = {
  labourers: ['id', 'name', 'contractor_id', 'photo_path'],
  labour_movements: ['id', 'labourer_id', 'direction', 'device_at', 'carrying_photo_path', 'flag'],
  visitors: ['id', 'name', 'company', 'purpose', 'meeting_staff_id', 'meeting_name', 'persons', 'id_type', 'photo_path', 'device_at'],
  vehicles: ['id', 'plate', 'vehicle_type', 'purpose', 'driver_name', 'plate_photo_path', 'challan_photo_path', 'loaded_photo_path', 'device_at'],
  incidents: ['id', 'type', 'note', 'photo_path', 'device_at'],
  mistake_reports: ['id', 'register', 'entry_id', 'reason', 'device_at'],
}

app.post('/guard/entries', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims
  const body = await c.req.json().catch(() => ({})) as { table?: string; row?: Record<string, unknown> }
  const table = body.table ?? ''
  const cols = ENTRY_COLUMNS[table]
  if (!cols || !body.row || !isUuid(body.row.id)) return c.json({ error: 'bad_request' }, 400)
  const row = pick(body.row, cols)
  for (const k of Object.keys(row)) if (k.endsWith('_path') && row[k] != null && !(typeof row[k] === 'string' && PHOTO_PATH.test(row[k] as string) && (row[k] as string).startsWith(a.unit_id + '/'))) return c.json({ error: 'bad_photo_path' }, 400)
  row.unit_id = a.unit_id
  const q = await db()
  if (table === 'labourers') {
    row.status = 'pending'
    row.created_by_guard_id = a.guard_id
    if (typeof row.name !== 'string' || !row.name.trim()) return c.json({ error: 'bad_request' }, 400)
    row.name_hi = nativeName(row.name.trim())
    if (row.contractor_id != null) {
      if (!isUuid(row.contractor_id)) return c.json({ error: 'bad_request' }, 400)
      const [con] = await q.query('select 1 from contractors where id = $1 and unit_id = $2', [row.contractor_id, a.unit_id])
      if (!con) row.contractor_id = null
    }
  } else if (table === 'labour_movements') {
    if (!isUuid(row.labourer_id) || !['in', 'out'].includes(row.direction as string)) return c.json({ error: 'bad_request' }, 400)
    const [lab] = await q.query('select 1 from labourers where id = $1 and unit_id = $2', [row.labourer_id, a.unit_id])
    if (!lab) return c.json({ error: 'unknown_labourer' }, 400)
    // Flag a repeated direction (IN while already IN, OUT while already OUT) from the server's own record.
    const [last] = await q.query<{ direction: string }>('select direction from labour_inside where labourer_id = $1', [row.labourer_id])
    row.flag = last && last.direction === row.direction ? `double_${row.direction}` : null
    row.guard_id = a.guard_id
    row.device_id = a.device_id
  } else if (table === 'visitors') {
    if (typeof row.name !== 'string' || !row.name.trim() || !VISITOR_PURPOSES.includes(row.purpose as string)) return c.json({ error: 'bad_request' }, 400)
    row.name = row.name.trim()
    row.company = typeof row.company === 'string' && row.company.trim() ? row.company.trim().slice(0, 120) : null
    row.meeting_name = typeof row.meeting_name === 'string' && row.meeting_name.trim() ? row.meeting_name.trim().slice(0, 120) : null
    row.id_type = ID_TYPES.includes(row.id_type as string) ? row.id_type : 'none'
    row.persons = Math.min(50, Math.max(1, Math.round(Number(row.persons) || 1)))
    if (row.meeting_staff_id != null) {
      if (!isUuid(row.meeting_staff_id)) return c.json({ error: 'bad_request' }, 400)
      const [st] = await q.query('select name from staff where id = $1 and unit_id = $2', [row.meeting_staff_id, a.unit_id])
      if (!st) row.meeting_staff_id = null
      else row.meeting_name ??= st.name
    }
    row.in_guard_id = a.guard_id
    row.device_id = a.device_id
  } else if (table === 'vehicles') {
    row.plate = normalizePlate(row.plate)
    if (!row.plate || !VEHICLE_TYPES.includes(row.vehicle_type as string) || !VEHICLE_PURPOSES.includes(row.purpose as string)) return c.json({ error: 'bad_request' }, 400)
    if (row.purpose === 'material_in' && !row.challan_photo_path) return c.json({ error: 'photo_required' }, 400)
    row.driver_name = typeof row.driver_name === 'string' && row.driver_name.trim() ? row.driver_name.trim().slice(0, 120) : null
    row.in_guard_id = a.guard_id
    row.device_id = a.device_id
  } else {
    row.guard_id = a.guard_id
    if (table === 'incidents') row.device_id = a.device_id
  }
  const { text, params } = insertSql(table, row)
  await q.query(text, params)
  return c.json({ ok: true })
})

app.post('/guard/rpc/attach_carrying_photo', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims
  const body = await c.req.json().catch(() => ({})) as { p_movement?: string; p_path?: string }
  if (!isUuid(body.p_movement) || typeof body.p_path !== 'string' || !PHOTO_PATH.test(body.p_path) || !body.p_path.startsWith(a.unit_id + '/')) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  await q.query(`update labour_movements set carrying_photo_path = $2 where id = $1 and unit_id = $3 and direction = 'out'
                 and carrying_photo_path is null and at > now() - interval '30 minutes'`, [body.p_movement, body.p_path, a.unit_id])
  return c.json({ ok: true })
})

/** Visitor OUT: only out_at / out_guard_id change, and only once. */
app.post('/guard/rpc/mark_visitor_out', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims
  const body = await c.req.json().catch(() => ({})) as { p_id?: string }
  if (!isUuid(body.p_id)) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  await q.query('update visitors set out_at = now(), out_guard_id = $2 where id = $1 and unit_id = $3 and out_at is null', [body.p_id, a.guard_id, a.unit_id])
  return c.json({ ok: true })
})

/** Material OUT / Scrap OUT: the loaded-vehicle photo, taken any time after loading and before OUT. Only fills an empty slot. */
app.post('/guard/rpc/attach_vehicle_photo', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims
  const body = await c.req.json().catch(() => ({})) as { p_id?: string; p_path?: string }
  if (!isUuid(body.p_id) || typeof body.p_path !== 'string' || !PHOTO_PATH.test(body.p_path) || !body.p_path.startsWith(a.unit_id + '/')) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  await q.query('update vehicles set loaded_photo_path = $2 where id = $1 and unit_id = $3 and loaded_photo_path is null', [body.p_id, body.p_path, a.unit_id])
  return c.json({ ok: true })
})

/**
 * Vehicle OUT. Came in empty: says whether it leaves loaded (photo required if yes).
 * Material OUT / Scrap OUT: needs the loaded-vehicle photo, attached earlier or sent now.
 */
app.post('/guard/rpc/mark_vehicle_out', requireRole('guard'), async (c) => {
  const a = c.get('auth') as GuardClaims
  const body = await c.req.json().catch(() => ({})) as { p_id?: string; p_loaded?: boolean | null; p_photo?: string | null }
  if (!isUuid(body.p_id)) return c.json({ error: 'bad_request' }, 400)
  const loaded = typeof body.p_loaded === 'boolean' ? body.p_loaded : null
  const photo = typeof body.p_photo === 'string' && body.p_photo ? body.p_photo : null
  if (photo && !(PHOTO_PATH.test(photo) && photo.startsWith(a.unit_id + '/'))) return c.json({ error: 'bad_photo_path' }, 400)
  const q = await db()
  const [v] = await q.query<{ purpose: string; loaded_photo_path: string | null; out_at: string | null }>('select purpose, loaded_photo_path, out_at from vehicles where id = $1 and unit_id = $2', [body.p_id, a.unit_id])
  if (!v) return c.json({ error: 'not_found' }, 404)
  if (v.out_at) return c.json({ ok: true })
  if (v.purpose === 'material_out' || v.purpose === 'scrap_out') {
    if (!v.loaded_photo_path && !photo) return c.json({ error: 'photo_required' }, 400)
    await q.query('update vehicles set out_at = now(), out_guard_id = $2, out_loaded = true, loaded_photo_path = coalesce(loaded_photo_path, $3) where id = $1 and out_at is null', [body.p_id, a.guard_id, photo])
    return c.json({ ok: true })
  }
  if (loaded === true && !photo) return c.json({ error: 'photo_required' }, 400)
  await q.query('update vehicles set out_at = now(), out_guard_id = $2, out_loaded = $3, out_loaded_photo_path = $4 where id = $1 and out_at is null', [body.p_id, a.guard_id, loaded, photo])
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Photos (guard: own unit; admin: all). Uploaded and served through the API.
// ---------------------------------------------------------------------------
function photoAllowed(c: { get: (k: 'auth') => Env['Variables']['auth'] }, path: string): boolean {
  const a = c.get('auth')
  return PHOTO_PATH.test(path) && (a.role === 'admin' || path.startsWith(a.unit_id + '/'))
}

app.put('/photos/*', requireRole('any'), async (c) => {
  const path = c.req.path.replace(/^\/api\/photos\//, '')
  if (!photoAllowed(c, path)) return c.json({ error: 'bad_path' }, 400)
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) return c.json({ error: 'bad_size' }, 400)
  await storage().put(path, bytes, 'image/jpeg')
  return c.json({ ok: true })
})

app.get('/photos/*', requireRole('any'), async (c) => {
  const path = c.req.path.replace(/^\/api\/photos\//, '')
  if (!photoAllowed(c, path)) return c.json({ error: 'bad_path' }, 400)
  const obj = await storage().get(path)
  if (!obj) return c.json({ error: 'not_found' }, 404)
  return c.body(obj.bytes, 200, { 'Content-Type': obj.contentType, 'Cache-Control': 'private, max-age=3600' })
})

// ---------------------------------------------------------------------------
// Admin: account
// ---------------------------------------------------------------------------
app.get('/admin/status', async (c) => {
  const q = await db()
  const [row] = await q.query<{ n: number | string }>('select count(*)::int as n from admin_users')
  return c.json({ needsSetup: Number(row?.n ?? 0) === 0 })
})

app.post('/admin/setup', async (c) => {
  const q = await db()
  const [row] = await q.query<{ n: number | string }>('select count(*)::int as n from admin_users')
  if (Number(row?.n ?? 0) > 0) return c.json({ error: 'already_setup' }, 403)
  const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string }
  if (!body.email || !body.password || body.password.length < 8) return c.json({ error: 'bad_request' }, 400)
  const hash = await bcrypt.hash(body.password, 10)
  const [admin] = await q.query('insert into admin_users (email, password_hash) values ($1, $2) returning id, email', [body.email.trim().toLowerCase(), hash])
  const token = await signToken({ role: 'admin', admin_id: admin.id as string, email: admin.email as string })
  return c.json({ token, email: admin.email })
})

app.post('/admin/login', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { email?: string; password?: string }
  if (!body.email || !body.password) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [admin] = await q.query('select id, email, password_hash from admin_users where email = $1', [body.email.trim().toLowerCase()])
  if (!admin || !(await bcrypt.compare(body.password, admin.password_hash as string))) { await sleep(500); return c.json({ error: 'bad_login' }, 401) }
  const token = await signToken({ role: 'admin', admin_id: admin.id as string, email: admin.email as string })
  return c.json({ token, email: admin.email })
})

const admin = new Hono<Env>()
admin.use('*', requireRole('admin'))

admin.get('/me', (c) => c.json({ email: (c.get('auth') as { email: string }).email }))

admin.get('/live', async (c) => {
  const q = await db()
  const [counts, movements, devices, inside, visitors, vehicles] = await Promise.all([
    q.query('select * from inside_counts'),
    q.query(`select m.id, m.unit_id, m.direction, m.at, m.offline, m.voided_at, m.flag, l.name as labourer_name, l.photo_path, g.name as guard_name
             from labour_movements m join labourers l on l.id = m.labourer_id left join guards g on g.id = m.guard_id
             where m.at >= ${IST_DAY_START} order by m.at desc limit 200`),
    q.query('select id, unit_id, label, last_seen_at, active from devices order by last_seen_at desc nulls last'),
    q.query(`select li.labourer_id, li.unit_id, li.name, li.photo_path, li.at as in_at, c.name as contractor_name
             from labour_inside li left join contractors c on c.id = li.contractor_id
             where li.direction = 'in' order by li.unit_id, li.name`),
    q.query(`select v.id, v.unit_id, v.name, v.company, v.purpose, v.meeting_name, v.persons, v.photo_path, v.in_at, v.out_at, v.voided_at, g.name as guard_name
             from visitors v left join guards g on g.id = v.in_guard_id
             where (v.out_at is null and v.voided_at is null) or v.in_at >= ${IST_DAY_START} order by v.in_at desc limit 200`),
    q.query(`select v.id, v.unit_id, v.plate, v.vehicle_type, v.purpose, v.driver_name, v.plate_photo_path, v.in_at, v.out_at, v.out_loaded, v.voided_at, g.name as guard_name
             from vehicles v left join guards g on g.id = v.in_guard_id
             where (v.out_at is null and v.voided_at is null) or v.in_at >= ${IST_DAY_START} order by v.in_at desc limit 200`),
  ])
  return c.json({ counts, movements, devices, inside, visitors, vehicles })
})

const unitParam = (c: { req: { query: (k: string) => string | undefined } }) => {
  const u = c.req.query('unit') ?? ''
  return UNITS.includes(u) ? u : null
}

// Labourers
admin.get('/labourers', async (c) => {
  const u = unitParam(c)
  if (!u) return c.json({ error: 'bad_unit' }, 400)
  const q = await db()
  await backfillNativeNames()
  return c.json(await q.query('select id, unit_id, name, name_hi, contractor_id, photo_path, status, skill, external_code, created_at, created_by_guard_id from labourers where unit_id = $1 order by name', [u]))
})
admin.post('/labourers', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const row = pick(body, ['name', 'name_hi', 'contractor_id', 'photo_path', 'status'])
  if (!UNITS.includes(body.unit_id as string) || typeof row.name !== 'string' || !row.name.trim()) return c.json({ error: 'bad_request' }, 400)
  row.unit_id = body.unit_id
  row.name_hi = typeof row.name_hi === 'string' && row.name_hi.trim() ? row.name_hi.trim() : nativeName(row.name.trim())
  row.id = crypto.randomUUID()
  row.status ??= 'approved'
  const { text, params } = insertSql('labourers', row)
  const q = await db()
  await q.query(text, params)
  return c.json({ id: row.id })
})
admin.patch('/labourers/:id', async (c) => {
  const id = c.req.param('id')
  if (!isUuid(id)) return c.json({ error: 'bad_request' }, 400)
  const patch = pick(await c.req.json().catch(() => ({})), ['name', 'name_hi', 'contractor_id', 'photo_path', 'status'])
  const q = await db()
  if (typeof patch.name === 'string' && patch.name_hi === undefined) patch.name_hi = nativeName(patch.name.trim())
  if (typeof patch.name_hi === 'string' && !patch.name_hi.trim()) {
    // Emptied by the admin: regenerate from the English name.
    const name = typeof patch.name === 'string' ? patch.name : (await q.query<{ name: string }>('select name from labourers where id = $1', [id]))[0]?.name
    patch.name_hi = name ? nativeName(name.trim()) : null
  }
  const s = updateSql('labourers', id, patch)
  if (!s) return c.json({ ok: true })
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})
/** Merge a guard-created duplicate into an existing labourer: move its movements, then reject the duplicate. */
admin.post('/labourers/:id/merge', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { target?: string }
  if (!isUuid(id) || !isUuid(body.target) || id === body.target) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const rows = await q.query('select id, unit_id from labourers where id in ($1, $2)', [id, body.target])
  if (rows.length !== 2 || rows[0].unit_id !== rows[1].unit_id) return c.json({ error: 'bad_request' }, 400)
  await q.query('update labour_movements set labourer_id = $2 where labourer_id = $1', [id, body.target])
  await q.query("update labourers set status = 'rejected' where id = $1", [id])
  return c.json({ ok: true })
})

// Live link to the production app
admin.get('/sync-status', async (c) => c.json(await getSyncStatus()))
admin.post('/sync-production', async (c) => c.json(await syncFromProduction({ force: true })))

// Contractors
admin.get('/contractors', async (c) => {
  const u = unitParam(c)
  if (!u) return c.json({ error: 'bad_unit' }, 400)
  const q = await db()
  return c.json(await q.query('select id, unit_id, name, active from contractors where unit_id = $1 order by name', [u]))
})
admin.post('/contractors', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { unit_id?: string; name?: string }
  if (!UNITS.includes(body.unit_id ?? '') || !body.name?.trim()) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [row] = await q.query('insert into contractors (unit_id, name) values ($1, $2) returning id', [body.unit_id, body.name.trim()])
  return c.json({ id: row.id })
})
admin.patch('/contractors/:id', async (c) => {
  const id = c.req.param('id')
  const s = isUuid(id) ? updateSql('contractors', id, pick(await c.req.json().catch(() => ({})), ['name', 'active'])) : null
  if (!s) return c.json({ ok: true })
  const q = await db()
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})

// Staff: the visitor "whom to meet" list
admin.get('/staff', async (c) => {
  const u = unitParam(c)
  if (!u) return c.json({ error: 'bad_unit' }, 400)
  const q = await db()
  return c.json(await q.query('select id, unit_id, name, phone, active, sort_order from staff where unit_id = $1 order by sort_order, name', [u]))
})
admin.post('/staff', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { unit_id?: string; name?: string; phone?: string }
  if (!UNITS.includes(body.unit_id ?? '') || !body.name?.trim()) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [row] = await q.query('insert into staff (unit_id, name, phone) values ($1, $2, $3) on conflict (unit_id, lower(name)) do update set active = true, phone = coalesce(excluded.phone, staff.phone) returning id', [body.unit_id, body.name.trim(), body.phone?.trim() || null])
  return c.json({ id: row.id })
})
admin.patch('/staff/:id', async (c) => {
  const id = c.req.param('id')
  const s = isUuid(id) ? updateSql('staff', id, pick(await c.req.json().catch(() => ({})), ['name', 'phone', 'active', 'sort_order'])) : null
  if (!s) return c.json({ ok: true })
  const q = await db()
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})

// Companies (vendors / transporters / service firms)
const COMPANY_CATS = ['raw_material', 'consumables', 'labour', 'repair', 'transport', 'rent', 'other']
admin.get('/companies', async (c) => {
  const q = await db()
  return c.json(await q.query('select id, unit_id, name, category, active from companies order by name'))
})
admin.post('/companies', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { unit_id?: string | null; name?: string; category?: string }
  if (!body.name?.trim() || (body.unit_id && !UNITS.includes(body.unit_id))) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [row] = await q.query(`insert into companies (unit_id, name, category) values ($1, $2, $3)
    on conflict (lower(name)) do update set active = true returning id`, [body.unit_id || null, body.name.trim(), COMPANY_CATS.includes(body.category ?? '') ? body.category : 'other'])
  return c.json({ id: row.id })
})
admin.patch('/companies/:id', async (c) => {
  const id = c.req.param('id')
  const patch = pick(await c.req.json().catch(() => ({})), ['name', 'category', 'active', 'unit_id'])
  if (patch.category !== undefined && !COMPANY_CATS.includes(patch.category as string)) return c.json({ error: 'bad_request' }, 400)
  if (patch.unit_id !== undefined && patch.unit_id !== null && !UNITS.includes(patch.unit_id as string)) return c.json({ error: 'bad_request' }, 400)
  const s = isUuid(id) ? updateSql('companies', id, patch) : null
  if (!s) return c.json({ ok: true })
  const q = await db()
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})

// Bulk import (pasted CSV rows, parsed on the client). Existing names are skipped.
admin.post('/import', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { type?: string; unit_id?: string; rows?: Record<string, string>[] }
  const rows = (body.rows ?? []).filter((r) => r && typeof r.name === 'string' && r.name.trim()).slice(0, 2000)
  if (!rows.length) return c.json({ error: 'no_rows' }, 400)
  const q = await db()
  let inserted = 0
  let skipped = 0
  if (body.type === 'contractors') {
    if (!UNITS.includes(body.unit_id ?? '')) return c.json({ error: 'bad_unit' }, 400)
    for (const r of rows) {
      const res = await q.query('insert into contractors (unit_id, name) values ($1, $2) on conflict (unit_id, lower(name)) do nothing returning id', [body.unit_id, r.name.trim()])
      res.length ? inserted++ : skipped++
    }
  } else if (body.type === 'companies') {
    for (const r of rows) {
      const cat = COMPANY_CATS.includes((r.category ?? '').trim().toLowerCase().replace(/ /g, '_')) ? (r.category ?? '').trim().toLowerCase().replace(/ /g, '_') : 'other'
      const unit = UNITS.includes((r.unit ?? '').trim().toLowerCase()) ? (r.unit ?? '').trim().toLowerCase() : null
      const res = await q.query('insert into companies (unit_id, name, category) values ($1, $2, $3) on conflict (lower(name)) do nothing returning id', [unit, r.name.trim(), cat])
      res.length ? inserted++ : skipped++
    }
  } else if (body.type === 'labourers') {
    if (!UNITS.includes(body.unit_id ?? '')) return c.json({ error: 'bad_unit' }, 400)
    const cons = await q.query<{ id: string; name: string }>('select id, name from contractors where unit_id = $1', [body.unit_id])
    const existing = new Set((await q.query<{ name: string }>('select name from labourers where unit_id = $1', [body.unit_id])).map((x) => x.name.trim().toLowerCase()))
    for (const r of rows) {
      const name = r.name.trim()
      if (existing.has(name.toLowerCase())) { skipped++; continue }
      let contractorId: string | null = null
      const cname = (r.contractor ?? '').trim()
      if (cname) {
        let con = cons.find((x) => x.name.toLowerCase() === cname.toLowerCase())
        if (!con) {
          const [made] = await q.query<{ id: string; name: string }>('insert into contractors (unit_id, name) values ($1, $2) on conflict (unit_id, lower(name)) do update set active = true returning id, name', [body.unit_id, cname])
          con = made
          cons.push(made)
        }
        contractorId = con.id
      }
      await q.query('insert into labourers (id, unit_id, name, name_hi, contractor_id, status) values ($1, $2, $3, $4, $5, $6)', [crypto.randomUUID(), body.unit_id, name, nativeName(name), contractorId, 'approved'])
      existing.add(name.toLowerCase())
      inserted++
    }
  } else {
    return c.json({ error: 'bad_type' }, 400)
  }
  return c.json({ inserted, skipped })
})

// Guards & PINs
async function setPin(guardId: string, unitId: string, pin: string): Promise<string | null> {
  if (!/^\d{4}$/.test(pin)) return 'PIN must be 4 digits'
  const q = await db()
  const others = await q.query('select pin_hash from guards where unit_id = $1 and id <> $2 and active and pin_hash is not null', [unitId, guardId])
  for (const o of others) if (await bcrypt.compare(pin, o.pin_hash as string)) return 'Another guard in this unit already has this PIN'
  await q.query('update guards set pin_hash = $2 where id = $1', [guardId, await bcrypt.hash(pin, 8)])
  return null
}
admin.get('/guards', async (c) => {
  const u = unitParam(c)
  if (!u) return c.json({ error: 'bad_unit' }, 400)
  const q = await db()
  return c.json(await q.query('select id, unit_id, name, language, active, (pin_hash is not null) as has_pin from guards where unit_id = $1 order by name', [u]))
})
admin.post('/guards', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { unit_id?: string; name?: string; language?: string | null; pin?: string }
  if (!UNITS.includes(body.unit_id ?? '') || !body.name?.trim() || !body.pin) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [row] = await q.query('insert into guards (unit_id, name, language) values ($1, $2, $3) returning id', [body.unit_id, body.name.trim(), body.language || null])
  const err = await setPin(row.id as string, body.unit_id!, body.pin)
  if (err) { await q.query('delete from guards where id = $1', [row.id]); return c.json({ error: err }, 400) }
  return c.json({ id: row.id })
})
admin.patch('/guards/:id', async (c) => {
  const id = c.req.param('id')
  const s = isUuid(id) ? updateSql('guards', id, pick(await c.req.json().catch(() => ({})), ['name', 'language', 'active'])) : null
  if (!s) return c.json({ ok: true })
  const q = await db()
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})
admin.post('/guards/:id/pin', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({})) as { pin?: string }
  if (!isUuid(id) || !body.pin) return c.json({ error: 'bad_request' }, 400)
  const q = await db()
  const [g] = await q.query('select unit_id from guards where id = $1', [id])
  if (!g) return c.json({ error: 'not_found' }, 404)
  const err = await setPin(id, g.unit_id as string, body.pin)
  return err ? c.json({ error: err }, 400) : c.json({ ok: true })
})

// Devices
admin.get('/devices', async (c) => {
  const q = await db()
  return c.json(await q.query(`select d.id, d.unit_id, d.label, d.registered_at, d.last_seen_at, d.locked_until, d.active, g.name as guard_name
                               from devices d left join guards g on g.id = d.last_guard_id order by d.registered_at desc`))
})
admin.patch('/devices/:id', async (c) => {
  const id = c.req.param('id')
  const patch = pick(await c.req.json().catch(() => ({})), ['label', 'unit_id', 'active', 'locked_until'])
  if (patch.unit_id !== undefined && !UNITS.includes(patch.unit_id as string)) return c.json({ error: 'bad_request' }, 400)
  const s = isUuid(id) ? updateSql('devices', id, patch) : null
  if (!s) return c.json({ ok: true })
  const q = await db()
  await q.query(s.text, s.params)
  return c.json({ ok: true })
})

app.route('/admin', admin)

app.notFound((c) => c.json({ error: 'not_found' }, 404))
