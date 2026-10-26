// Consolidated daily report, one email per unit, sent by Vercel Cron at 20:00 IST (vercel.json) to units.report_email.
// Also previewable and re-sendable from Admin -> Email. One row per unit per day in daily_reports.
import { db, type Row } from './db.js'
import { parseRecipients } from './mail.js'
import { esc, sendLogged } from './notify.js'
import { fmtDayIst, fmtDurationMin, fmtTimeIst, istDayRange } from './time.js'

const label = (s: unknown) => String(s ?? '').replace(/_/g, ' ')
const mins = (a: string, b: string | Date = new Date()) => (new Date(b).getTime() - new Date(a).getTime()) / 60000
/** Timestamps come back as strings from Neon and as Date objects from PGlite; compare as numbers. */
const ms = (x: unknown) => (x ? new Date(x as string).getTime() : NaN)

function table(headers: string[], rows: unknown[][], rowStyle?: (i: number) => string): string {
  if (rows.length === 0) return '<p style="color:#777;margin:4px 0 12px">None.</p>'
  const th = headers.map((h) => `<th style="text-align:left;padding:5px 8px;border-bottom:2px solid #ccc;background:#f3f4f6;white-space:nowrap">${esc(h)}</th>`).join('')
  const body = rows.map((r, i) => `<tr style="${rowStyle?.(i) ?? ''}">${r.map((c) => `<td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top">${esc(c)}</td>`).join('')}</tr>`).join('')
  return `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:4px 0 14px">${`<tr>${th}</tr>`}${body}</table>`
}

const h2 = (s: string) => `<h2 style="font-size:17px;margin:18px 0 4px;border-left:4px solid #1d4ed8;padding-left:8px">${esc(s)}</h2>`

export interface DailyReport { subject: string; html: string; text: string; to: string[] }

export async function buildDailyReport(unitId: string, day: string): Promise<DailyReport | null> {
  const q = await db()
  const [u] = await q.query<Row>('select id, name, shift_start, report_email from units where id = $1', [unitId])
  if (!u) return null
  const [start, end] = istDayRange(day)
  const isToday = new Date() < new Date(end)
  const shiftStart = new Date(`${day}T${String(u.shift_start ?? '09:00').slice(0, 5)}:00+05:30`)

  const [moves, inside, visitors, vehicles, mistakes, emailErrors] = await Promise.all([
    q.query<Row>(`select m.id, m.labourer_id, m.direction, m.at, m.offline, m.flag, m.voided_at, l.name, l.name_hi, c.name as contractor, g.name as guard
      from labour_movements m join labourers l on l.id = m.labourer_id left join contractors c on c.id = l.contractor_id
      left join guards g on g.id = m.guard_id where m.unit_id = $1 and m.at >= $2 and m.at < $3 order by m.at`, [unitId, start, end]),
    q.query<Row>(`select li.labourer_id, li.at, li.name, l.name_hi, c.name as contractor from labour_inside li join labourers l on l.id = li.labourer_id
      left join contractors c on c.id = l.contractor_id where li.unit_id = $1 and li.direction = 'in' order by li.at`, [unitId]),
    q.query<Row>(`select v.*, st.name as staff_name from visitors v left join staff st on st.id = v.meeting_staff_id
      where v.unit_id = $1 and ((v.in_at >= $2 and v.in_at < $3) or (v.out_at >= $2 and v.out_at < $3) or (v.out_at is null and v.voided_at is null and v.in_at < $3))
      order by v.in_at`, [unitId, start, end]),
    q.query<Row>(`select * from vehicles v where v.unit_id = $1 and ((v.in_at >= $2 and v.in_at < $3) or (v.out_at >= $2 and v.out_at < $3)
      or (v.out_at is null and v.voided_at is null and v.in_at < $3)) order by v.in_at`, [unitId, start, end]),
    q.query<Row>(`select mr.register, mr.reason, mr.at, mr.resolved_at, g.name as guard from mistake_reports mr left join guards g on g.id = mr.guard_id
      where mr.unit_id = $1 and mr.at >= $2 and mr.at < $3 order by mr.at`, [unitId, start, end]),
    q.query<Row>(`select kind, subject, error, created_at from email_log where unit_id = $1 and error is not null and created_at >= $2 and created_at < $3 order by created_at`, [unitId, start, end]),
  ])

  const live = moves.filter((m) => !m.voided_at)
  const ins = live.filter((m) => m.direction === 'in')
  const outs = live.filter((m) => m.direction === 'out')
  const flagged = live.filter((m) => m.flag)

  // One line per person: first IN, last OUT, number of movements.
  const people = new Map<string, { name: string; contractor: string; firstIn: string | null; lastOut: string | null; n: number; flagged: boolean }>()
  for (const m of live) {
    const k = m.labourer_id as string
    const p = people.get(k) ?? { name: m.name_hi && m.name_hi !== m.name ? `${m.name} (${m.name_hi})` : String(m.name), contractor: String(m.contractor ?? ''), firstIn: null, lastOut: null, n: 0, flagged: false }
    p.n++
    if (m.flag) p.flagged = true
    if (m.direction === 'in' && !p.firstIn) p.firstIn = m.at as string
    if (m.direction === 'out') p.lastOut = m.at as string
    people.set(k, p)
  }
  const insideIds = new Set(inside.map((r) => r.labourer_id as string))
  const late = [...people.entries()].filter(([, p]) => p.firstIn && new Date(p.firstIn) > shiftStart)

  const S = ms(start), E = ms(end)
  const within = (x: unknown) => ms(x) >= S && ms(x) < E
  const vIn = visitors.filter((v) => within(v.in_at) && !v.voided_at)
  const visitorPersons = vIn.reduce((n, v) => n + Number(v.persons ?? 1), 0)
  const visitorsInside = visitors.filter((v) => !v.out_at && !v.voided_at)
  const hIn = vehicles.filter((v) => within(v.in_at) && !v.voided_at)
  const hOut = vehicles.filter((v) => within(v.out_at) && !v.voided_at)
  const vehiclesInside = vehicles.filter((v) => !v.out_at && !v.voided_at)

  const stat = (n: number | string, l: string, color = '#1d4ed8') =>
    `<td style="padding:8px 10px;text-align:center;border:1px solid #e5e7eb"><div style="font-size:22px;font-weight:700;color:${color}">${esc(n)}</div><div style="font-size:12px;color:#555">${esc(l)}</div></td>`

  const insideNote = isToday ? 'inside now' : 'still inside at end of day'
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:900px">
<div style="background:#1d4ed8;color:#fff;padding:12px 16px;border-radius:8px">
<div style="font-size:20px;font-weight:700">${esc(u.name)} · Daily gate report</div><div>${esc(fmtDayIst(start))}</div></div>
<table style="border-collapse:collapse;margin:12px 0;width:100%"><tr>
${stat(ins.length, 'labour IN', '#15803d')}${stat(outs.length, 'labour OUT', '#c2410c')}${stat(people.size, 'different people')}
${stat(insideIds.size, `labour ${insideNote}`)}${stat(`${vIn.length} (${visitorPersons})`, 'visitors (persons)')}${stat(`${hIn.length} / ${hOut.length}`, 'vehicles IN / OUT')}
${stat(flagged.length, 'flagged', flagged.length ? '#b91c1c' : '#1d4ed8')}
</tr></table>
${flagged.length ? `${h2(`⚠ Flagged entries (${flagged.length})`)}${table(['Time', 'Person', 'Problem', 'Guard'], flagged.map((m) => [fmtTimeIst(m.at as string), m.name, m.flag === 'double_in' ? 'IN again while already IN' : 'OUT again while already OUT', m.guard]), () => 'background:#fef2f2')}` : ''}
${h2(`Late arrivals: first IN after shift start ${String(u.shift_start ?? '09:00').slice(0, 5)} (${late.length})`)}
${table(['Name', 'Contractor', 'First IN'], late.map(([, p]) => [p.name, p.contractor, fmtTimeIst(p.firstIn)]))}
${h2(`Labour today (${people.size} people, ${ins.length} IN, ${outs.length} OUT)`)}
${table(['Name', 'Contractor', 'First IN', 'Last OUT', 'Entries', 'Now'],
  [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, p]) => [p.name, p.contractor, fmtTimeIst(p.firstIn), fmtTimeIst(p.lastOut), p.n, (insideIds.has(id) ? 'INSIDE' : 'out') + (p.flagged ? ' ⚠' : '')]))}
${h2(`Labour ${insideNote} (${inside.length})`)}
${table(['Name', 'Contractor', 'IN since', 'Time inside'], inside.map((r) => [r.name_hi && r.name_hi !== r.name ? `${r.name} (${r.name_hi})` : r.name, r.contractor, fmtTimeIst(r.at as string) + (ms(r.at) < S ? ' (earlier day)' : ''), fmtDurationMin(mins(r.at as string, isToday ? new Date() : end))]))}
${h2(`Visitors (${vIn.length} entries, ${visitorPersons} persons; ${visitorsInside.length} ${insideNote})`)}
${table(['Name', 'Company', 'Purpose', 'To meet', 'Persons', 'IN', 'OUT'], visitors.map((v) => [v.name, v.company, label(v.purpose), v.meeting_name ?? v.staff_name, v.persons, fmtTimeIst(v.in_at as string), v.out_at ? fmtTimeIst(v.out_at as string) : 'still inside']), (i) => (!visitors[i].out_at ? 'background:#f0fdf4' : ''))}
${h2(`Vehicles (${hIn.length} IN, ${hOut.length} OUT; ${vehiclesInside.length} ${insideNote})`)}
${table(['Plate', 'Type', 'Purpose', 'Driver', 'IN', 'OUT', 'Loaded'], vehicles.map((v) => [v.plate, label(v.vehicle_type), label(v.purpose), v.driver_name, fmtTimeIst(v.in_at as string), v.out_at ? fmtTimeIst(v.out_at as string) : `still inside (${fmtDurationMin(mins(v.in_at as string, isToday ? new Date() : end))})`, v.out_loaded === true ? 'yes' : v.out_loaded === false ? 'no' : '']), (i) => (!vehicles[i].out_at ? 'background:#f0fdf4' : ''))}
${h2(`Mistake reports by guards (${mistakes.length})`)}
${table(['Time', 'Register', 'Reason', 'Guard', 'Resolved'], mistakes.map((m) => [fmtTimeIst(m.at as string), m.register, label(m.reason), m.guard, m.resolved_at ? 'yes' : 'open']))}
${emailErrors.length ? `${h2(`Emails that could not be sent today (${emailErrors.length})`)}${table(['Time', 'Email', 'Error'], emailErrors.map((e) => [fmtTimeIst(e.created_at as string), e.subject, e.error]))}` : ''}
<p style="color:#888;font-size:12px;margin-top:18px">Fairtech Gate · automatic daily report. Times are IST.</p>
</div>`

  const text = [
    `${u.name} · Daily gate report · ${fmtDayIst(start)}`,
    `Labour: ${ins.length} IN, ${outs.length} OUT, ${people.size} people, ${insideIds.size} ${insideNote}`,
    `Visitors: ${vIn.length} entries (${visitorPersons} persons), ${visitorsInside.length} ${insideNote}`,
    `Vehicles: ${hIn.length} IN, ${hOut.length} OUT, ${vehiclesInside.length} ${insideNote}`,
    `Flagged: ${flagged.length}. Late arrivals: ${late.length}. Mistake reports: ${mistakes.length}.`,
    ...flagged.map((m) => `  ⚠ ${fmtTimeIst(m.at as string)} ${m.name}: ${m.flag === 'double_in' ? 'IN again while already IN' : 'OUT again while already OUT'}`),
    'Open the HTML version of this email for the full lists.',
  ].join('\n')

  const subject = `${u.name} · Daily gate report · ${fmtDayIst(start)} · ${ins.length} IN / ${outs.length} OUT${flagged.length ? ` · ⚠ ${flagged.length} flagged` : ''}`
  return { subject, html, text, to: parseRecipients(u.report_email as string | null) }
}

/** Send the report once per unit per day (force = send again). Never throws. */
export async function sendDailyReport(unitId: string, day: string, force = false): Promise<{ unit: string; ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const q = await db()
    if (!force) {
      const [done] = await q.query('select 1 from daily_reports where unit_id = $1 and report_date = $2 and sent_at is not null', [unitId, day])
      if (done) return { unit: unitId, ok: true, skipped: true }
    }
    const r = await buildDailyReport(unitId, day)
    if (!r) return { unit: unitId, ok: false, error: 'unknown unit' }
    const res = await sendLogged(unitId, 'daily_report', null, { subject: r.subject, html: r.html, text: r.text }, r.to)
    await q.query(`insert into daily_reports (unit_id, report_date, sent_at, error) values ($1, $2, $3, $4)
      on conflict (unit_id, report_date) do update set sent_at = coalesce(excluded.sent_at, daily_reports.sent_at), error = excluded.error`,
      [unitId, day, res.ok ? new Date().toISOString() : null, res.ok ? null : res.error])
    return { unit: unitId, ok: res.ok, error: res.error }
  } catch (e) {
    return { unit: unitId, ok: false, error: String((e as Error)?.message ?? e) }
  }
}
