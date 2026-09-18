import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { db, insertSql, isUuid, pick, updateSql, type Row } from './db.js'
import { storage, PHOTO_PATH } from './storage.js'
import { requireRole, signToken, type Env, type GuardClaims } from './auth.js'
import { IST_DAY_START } from './time.js'

export const app = new Hono<Env>().basePath('/api')

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'server', detail: String(err.message ?? err) }, 500)
})

const UNITS = ['dehu', 'savli']

// ---------------------------------------------------------------------------
// Health: open /api/health in a browser to see what is configured and whether the database answers.
// ---------------------------------------------------------------------------
app.get('/health', async (c) => {
  const config = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL || process.env.PGLITE_DIR !== undefined),
    JWT_SECRET: Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16),
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
  return c.json({ ok, config, database, admins, hint: !config.DATABASE_URL ? 'Add DATABASE_URL in Vercel → Settings → Environment Variables, then redeploy.'
    : !config.JWT_SECRET ? 'Add JWT_SECRET (16+ characters) in Vercel → Settings → Environment Variables, then redeploy.'
    : database !== 'ok' ? 'Database error. If it says a table does not exist, run db/schema.sql in the Neon SQL editor.'
    : !config.BLOB_STORE ? 'Photos will fail until a Vercel Blob store is connected (Storage → Create → Blob), then redeploy.' : 'All good.' }, ok ? 200 : 500)
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
  const [labourers, contractors, movements, inside, mistakes, counts, unit] = await Promise.all([
    q.query(`select l.id, l.unit_id, l.name, l.contractor_id, c.name as contractor_name, l.photo_path, l.status, l.updated_at
             from labourers l left join contractors c on c.id = l.contractor_id
             where l.unit_id = $1 and l.status in ('approved','pending') order by l.name`, [u]),
    q.query('select id, unit_id, name, active from contractors where unit_id = $1 and active order by name', [u]),
    q.query(`select id, unit_id, labourer_id, direction, at, device_at, guard_id, carrying_photo_path, voided_at, void_reason
             from labour_movements where unit_id = $1 and at >= ${IST_DAY_START} order by at desc limit 1000`, [u]),
    q.query('select id, unit_id, labourer_id, direction, at, device_at, guard_id, carrying_photo_path from labour_inside where unit_id = $1', [u]),
    q.query(`select id, entry_id, register, reason, at from mistake_reports where unit_id = $1 and at >= ${IST_DAY_START}`, [u]),
    q.query('select labour, visitors, vehicles from inside_counts where unit_id = $1', [u]),
    q.query('select id, name, default_language, unit_head_name, unit_head_phone from units where id = $1', [u]),
  ])
  // Refresh the token when it is within 7 days of expiry.
  const token = a.exp - Date.now() / 1000 < 7 * 24 * 3600 ? await signToken({ role: 'guard', unit_id: a.unit_id, guard_id: a.guard_id, device_id: a.device_id }) : undefined
  return c.json({ labourers, contractors, movements, inside, mistakes, counts: counts[0] ?? { labour: 0, visitors: 0, vehicles: 0 }, unit: unit[0], token })
})

// ---------------------------------------------------------------------------
// Guard: insert-only entries. Columns are whitelisted; unit and guard come from the token.
// ---------------------------------------------------------------------------
const ENTRY_COLUMNS: Record<string, string[]> = {
  labourers: ['id', 'name', 'contractor_id', 'photo_path'],
  labour_movements: ['id', 'labourer_id', 'direction', 'device_at', 'carrying_photo_path'],
  visitors: ['id', 'name', 'company', 'purpose', 'meeting_staff_id', 'meeting_name', 'persons', 'id_type', 'photo_path', 'device_at'],
  vehicles: ['id', 'plate', 'vehicle_type', 'purpose', 'driver_name', 'plate_photo_path', 'challan_photo_path', 'loaded_photo_path', 'gatepass_photo_path', 'device_at'],
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
    if (row.contractor_id != null) {
      if (!isUuid(row.contractor_id)) return c.json({ error: 'bad_request' }, 400)
      const [con] = await q.query('select 1 from contractors where id = $1 and unit_id = $2', [row.contractor_id, a.unit_id])
      if (!con) row.contractor_id = null
    }
  } else if (table === 'labour_movements') {
    if (!isUuid(row.labourer_id) || !['in', 'out'].includes(row.direction as string)) return c.json({ error: 'bad_request' }, 400)
    const [lab] = await q.query('select 1 from labourers where id = $1 and unit_id = $2', [row.labourer_id, a.unit_id])
    if (!lab) return c.json({ error: 'unknown_labourer' }, 400)
    row.guard_id = a.guard_id
    row.device_id = a.device_id
  } else if (table === 'visitors' || table === 'vehicles') {
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
  const [counts, movements, devices, inside] = await Promise.all([
    q.query('select * from inside_counts'),
    q.query(`select m.id, m.unit_id, m.direction, m.at, m.offline, m.voided_at, l.name as labourer_name, l.photo_path, g.name as guard_name
             from labour_movements m join labourers l on l.id = m.labourer_id left join guards g on g.id = m.guard_id
             where m.at >= ${IST_DAY_START} order by m.at desc limit 200`),
    q.query('select id, unit_id, label, last_seen_at, active from devices order by last_seen_at desc nulls last'),
    q.query(`select li.labourer_id, li.unit_id, li.name, li.photo_path, li.at as in_at, c.name as contractor_name
             from labour_inside li left join contractors c on c.id = li.contractor_id
             where li.direction = 'in' order by li.unit_id, li.name`),
  ])
  return c.json({ counts, movements, devices, inside })
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
  return c.json(await q.query('select id, unit_id, name, contractor_id, photo_path, status, created_at, created_by_guard_id from labourers where unit_id = $1 order by name', [u]))
})
admin.post('/labourers', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const row = pick(body, ['name', 'contractor_id', 'photo_path', 'status'])
  if (!UNITS.includes(body.unit_id as string) || typeof row.name !== 'string' || !row.name.trim()) return c.json({ error: 'bad_request' }, 400)
  row.unit_id = body.unit_id
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
  const patch = pick(await c.req.json().catch(() => ({})), ['name', 'contractor_id', 'photo_path', 'status'])
  const s = updateSql('labourers', id, patch)
  if (!s) return c.json({ ok: true })
  const q = await db()
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
