// Per-entry emails: every labour / visitor / vehicle IN and OUT goes to the unit's report_email
// (units.report_email, comma-separated for several people; editable in Admin -> Email).
// Called by the API right after a row is first stored, so a phone retry never sends twice.
// Never throws; every attempt is logged in email_log.
import { db, type Row } from './db.js'
import { parseRecipients, sendMail, type Mail } from './mail.js'
import { fmtDateTimeIst, fmtDurationMin, fmtTimeIst } from './time.js'

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)
const label = (s: unknown) => String(s ?? '').replace(/_/g, ' ')

interface UnitMail { id: string; name: string; report_email: string | null; notify_each: boolean }

async function unitMail(unitId: string): Promise<UnitMail | null> {
  const q = await db()
  const [u] = await q.query<UnitMail>('select id, name, report_email, notify_each from units where id = $1', [unitId])
  return u ?? null
}

/** Send and record. kind: labour_in, visitor_out, daily_report, test, ... */
export async function sendLogged(unitId: string, kind: string, refId: string | null, m: Omit<Mail, 'to'>, to: string[]): Promise<{ ok: boolean; error?: string }> {
  const r = await sendMail({ ...m, to })
  try {
    const q = await db()
    await q.query('insert into email_log (unit_id, kind, ref_id, to_email, subject, sent_at, error) values ($1, $2, $3, $4, $5, $6, $7)',
      [unitId, kind, refId, to.join(', ') || null, m.subject.slice(0, 300), r.ok ? new Date().toISOString() : null, r.ok ? null : r.error])
  } catch (e) {
    console.error('email_log insert failed', e)
  }
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

/** A small two-column table email with a coloured banner. */
export function eventHtml(banner: { text: string; color: string }, title: string, rows: [string, unknown][], note?: string): string {
  const tr = rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`).join('')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111;max-width:560px">
<div style="background:${banner.color};color:#fff;padding:10px 14px;border-radius:8px 8px 0 0;font-size:18px;font-weight:700">${esc(banner.text)}</div>
<div style="border:1px solid #ddd;border-top:0;border-radius:0 0 8px 8px;padding:12px 14px">
<div style="font-size:20px;font-weight:700;margin-bottom:6px">${esc(title)}</div>
${note ? `<div style="background:#fee2e2;color:#991b1b;padding:8px 10px;border-radius:6px;margin:6px 0;font-weight:700">${esc(note)}</div>` : ''}
<table style="border-collapse:collapse">${tr}</table>
</div>
<div style="color:#888;font-size:12px;margin-top:8px">Fairtech Gate · automatic email</div>
</div>`
}

const textOf = (title: string, rows: [string, unknown][], note?: string) =>
  [title, note ?? '', ...rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n')

const GREEN = '#15803d'
const ORANGE = '#c2410c'
const RED = '#b91c1c'

async function deliver(unitId: string, kind: string, refId: string, subject: string, banner: { text: string; color: string }, title: string, rows: [string, unknown][], note?: string) {
  const u = await unitMail(unitId)
  if (!u || !u.notify_each) return
  await sendLogged(unitId, kind, refId, { subject, html: eventHtml(banner, title, rows, note), text: textOf(title, rows, note) }, parseRecipients(u.report_email))
}

export async function notifyLabourMovement(movementId: string): Promise<void> {
  try {
    const q = await db()
    const [m] = await q.query<Row>(`select m.id, m.unit_id, m.labourer_id, m.direction, m.at, m.offline, m.device_at, m.flag,
        l.name, l.name_hi, l.skill, l.external_code, l.status, c.name as contractor, g.name as guard, u.name as unit_name
      from labour_movements m join labourers l on l.id = m.labourer_id left join contractors c on c.id = l.contractor_id
      left join guards g on g.id = m.guard_id join units u on u.id = m.unit_id where m.id = $1`, [movementId])
    if (!m) return
    const dir = m.direction === 'in' ? 'IN' : 'OUT'
    let since: string | null = null
    if (m.direction === 'out') {
      const [prev] = await q.query<{ at: string }>(`select at from labour_movements where labourer_id = $1 and id <> $2 and voided_at is null
        and direction = 'in' and at < $3 order by at desc limit 1`, [m.labourer_id, m.id, m.at])
      if (prev) since = `${fmtDateTimeIst(prev.at)} (${fmtDurationMin((new Date(m.at as string).getTime() - new Date(prev.at).getTime()) / 60000)} inside)`
    }
    const flagNote = m.flag === 'double_in' ? 'FLAGGED: marked IN again while already IN' : m.flag === 'double_out' ? 'FLAGGED: marked OUT again while already OUT' : undefined
    const subject = `${flagNote ? '⚠ FLAGGED · ' : ''}${m.unit_name} · Labour ${dir} · ${m.name} · ${fmtTimeIst(m.at as string)}`
    await deliver(m.unit_id as string, `labour_${m.direction}`, m.id as string, subject,
      { text: `${m.unit_name} · Labour ${dir}`, color: flagNote ? RED : m.direction === 'in' ? GREEN : ORANGE },
      `${m.name}${m.name_hi && m.name_hi !== m.name ? `  (${m.name_hi})` : ''}`,
      [
        ['Direction', dir],
        ['Time', fmtDateTimeIst(m.at as string)],
        ['IN since', since],
        ['Contractor', m.contractor],
        ['Code / skill', [m.external_code, m.skill].filter(Boolean).join(' · ')],
        ['Status', m.status === 'pending' ? 'NEW person, approval pending' : null],
        ['Guard', m.guard],
        ['Phone time', m.offline ? `${fmtDateTimeIst(m.device_at as string)} (entered offline, sent later)` : null],
      ], flagNote)
  } catch (e) {
    console.error('notifyLabourMovement', e)
  }
}

export async function notifyVisitor(id: string, direction: 'in' | 'out'): Promise<void> {
  try {
    const q = await db()
    const [v] = await q.query<Row>(`select v.*, st.name as staff_name, gi.name as in_guard, go.name as out_guard, u.name as unit_name
      from visitors v left join staff st on st.id = v.meeting_staff_id left join guards gi on gi.id = v.in_guard_id
      left join guards go on go.id = v.out_guard_id join units u on u.id = v.unit_id where v.id = $1`, [id])
    if (!v) return
    const dir = direction === 'in' ? 'IN' : 'OUT'
    const at = (direction === 'in' ? v.in_at : v.out_at) as string
    const persons = Number(v.persons ?? 1)
    await deliver(v.unit_id as string, `visitor_${direction}`, id,
      `${v.unit_name} · Visitor ${dir} · ${v.name}${persons > 1 ? ` (+${persons - 1})` : ''} · ${fmtTimeIst(at)}`,
      { text: `${v.unit_name} · Visitor ${dir}`, color: direction === 'in' ? GREEN : ORANGE },
      String(v.name),
      [
        ['Direction', dir],
        ['Time', fmtDateTimeIst(at)],
        ['IN at', direction === 'out' ? `${fmtDateTimeIst(v.in_at as string)} (${fmtDurationMin((new Date(at).getTime() - new Date(v.in_at as string).getTime()) / 60000)} inside)` : null],
        ['Company', v.company],
        ['Purpose', label(v.purpose)],
        ['To meet', v.meeting_name ?? v.staff_name],
        ['Persons', persons],
        ['ID shown', label(v.id_type)],
        ['Guard', direction === 'in' ? v.in_guard : v.out_guard],
        ['Phone time', direction === 'in' && v.offline ? `${fmtDateTimeIst(v.device_at as string)} (entered offline, sent later)` : null],
      ])
  } catch (e) {
    console.error('notifyVisitor', e)
  }
}

export async function notifyVehicle(id: string, direction: 'in' | 'out'): Promise<void> {
  try {
    const q = await db()
    const [v] = await q.query<Row>(`select v.*, gi.name as in_guard, go.name as out_guard, u.name as unit_name
      from vehicles v left join guards gi on gi.id = v.in_guard_id left join guards go on go.id = v.out_guard_id
      join units u on u.id = v.unit_id where v.id = $1`, [id])
    if (!v) return
    const dir = direction === 'in' ? 'IN' : 'OUT'
    const at = (direction === 'in' ? v.in_at : v.out_at) as string
    await deliver(v.unit_id as string, `vehicle_${direction}`, id,
      `${v.unit_name} · Vehicle ${dir} · ${v.plate} · ${label(v.purpose)} · ${fmtTimeIst(at)}`,
      { text: `${v.unit_name} · Vehicle ${dir}`, color: direction === 'in' ? GREEN : ORANGE },
      String(v.plate),
      [
        ['Direction', dir],
        ['Time', fmtDateTimeIst(at)],
        ['IN at', direction === 'out' ? `${fmtDateTimeIst(v.in_at as string)} (${fmtDurationMin((new Date(at).getTime() - new Date(v.in_at as string).getTime()) / 60000)} inside)` : null],
        ['Type', label(v.vehicle_type)],
        ['Purpose', label(v.purpose)],
        ['Driver', v.driver_name],
        ['Challan photo', v.challan_photo_path ? 'taken' : null],
        ['Loaded-vehicle photo', v.loaded_photo_path ? 'taken' : null],
        ['Left loaded?', direction === 'out' && v.out_loaded !== null ? (v.out_loaded ? 'Yes' : 'No, empty') : null],
        ['Guard', direction === 'in' ? v.in_guard : v.out_guard],
        ['Phone time', direction === 'in' && v.offline ? `${fmtDateTimeIst(v.device_at as string)} (entered offline, sent later)` : null],
      ])
  } catch (e) {
    console.error('notifyVehicle', e)
  }
}
