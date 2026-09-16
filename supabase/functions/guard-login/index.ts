// Guard login: device + 4-digit PIN -> Supabase session with guard claims.
// Deploy: supabase functions deploy guard-login --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  let body: { device_id?: string; unit_id?: string; pin?: string; device_label?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const { device_id, pin, device_label } = body
  if (!device_id || !UUID.test(device_id) || !pin || !/^\d{4}$/.test(pin)) return json({ error: 'bad_request' }, 400)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 1. Device -> unit (locked on first login)
  const { data: device } = await admin.from('devices').select('*').eq('id', device_id).maybeSingle()
  let unitId: string
  if (device) {
    if (!device.active) return json({ error: 'device_disabled' }, 403)
    if (device.locked_until && new Date(device.locked_until) > new Date()) return json({ error: 'locked' }, 429)
    unitId = device.unit_id
  } else {
    if (!body.unit_id) return json({ error: 'unit_required' }, 400)
    const { data: unit } = await admin.from('units').select('id, active').eq('id', body.unit_id).maybeSingle()
    if (!unit || !unit.active) return json({ error: 'bad_unit' }, 400)
    unitId = unit.id
  }

  // 2. PIN
  const { data: found, error: verr } = await admin.rpc('verify_guard_pin', { p_unit: unitId, p_pin: pin })
  if (verr) return json({ error: 'server', detail: verr.message }, 500)
  const guard = Array.isArray(found) ? found[0] : found
  if (!guard) {
    if (device) {
      const attempts = (device.failed_attempts ?? 0) + 1
      const lock = attempts >= MAX_ATTEMPTS
      await admin.from('devices').update({
        failed_attempts: lock ? 0 : attempts,
        locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      }).eq('id', device_id)
      if (lock) return json({ error: 'locked' }, 429)
    }
    await new Promise((r) => setTimeout(r, 800))
    return json({ error: 'bad_pin' }, 401)
  }

  // 3. Make sure the guard has an auth user with the right claims
  const appMeta = { role: 'guard', unit_id: unitId, guard_id: guard.id }
  let { data: ga } = await admin.from('guard_auth').select('*').eq('guard_id', guard.id).maybeSingle()
  const email = `guard-${guard.id}@guards.fairtech.invalid`
  if (!ga) {
    const secret = crypto.randomUUID() + crypto.randomUUID()
    const { data: created, error: cerr } = await admin.auth.admin.createUser({
      email, password: secret, email_confirm: true, app_metadata: appMeta, user_metadata: { name: guard.name },
    })
    if (cerr || !created.user) return json({ error: 'server', detail: cerr?.message }, 500)
    const { data: inserted, error: ierr } = await admin.from('guard_auth')
      .insert({ guard_id: guard.id, auth_user_id: created.user.id, secret }).select('*').single()
    if (ierr) return json({ error: 'server', detail: ierr.message }, 500)
    ga = inserted
  } else {
    await admin.auth.admin.updateUserById(ga.auth_user_id, { app_metadata: appMeta })
  }

  // 4. Sign in as that user and hand the session to the phone
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: session, error: serr } = await anon.auth.signInWithPassword({ email, password: ga.secret })
  if (serr || !session.session) return json({ error: 'server', detail: serr?.message }, 500)

  // 5. Register / touch the device
  if (device) {
    await admin.from('devices').update({ last_seen_at: new Date().toISOString(), last_guard_id: guard.id, failed_attempts: 0, locked_until: null }).eq('id', device_id)
  } else {
    await admin.from('devices').insert({ id: device_id, unit_id: unitId, label: device_label ?? null, last_seen_at: new Date().toISOString(), last_guard_id: guard.id })
  }
  const { data: unit } = await admin.from('units').select('id, name, default_language, unit_head_name, unit_head_phone').eq('id', unitId).single()

  return json({
    session: { access_token: session.session.access_token, refresh_token: session.session.refresh_token },
    guard: { id: guard.id, name: guard.name, language: guard.language },
    unit,
  })
})
