// Live views over the local cache: who / what is inside now, and today's entries across all registers.
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { localName } from '../lib/names'
import { istDayStart } from '../lib/time'
import type { Direction, Lang, Register, Vehicle, Visitor } from '../lib/types'

/** Ids of labourers whose last non-voided movement is IN. */
export function useLabourInside(): Set<string> {
  return useLiveQuery(async () => {
    const all = await db.movements.filter((m) => !m.voided_at).toArray()
    const latest = new Map<string, { direction: string; at: string }>()
    for (const m of all) {
      const cur = latest.get(m.labourer_id)
      if (!cur || m.at > cur.at) latest.set(m.labourer_id, { direction: m.direction, at: m.at })
    }
    return new Set([...latest.entries()].filter(([, v]) => v.direction === 'in').map(([k]) => k))
  }, [], new Set<string>())
}

export interface LabourStatus { direction: Direction; at: string }

/** Last non-voided movement per labourer (today's movements plus everyone inside are cached). */
export function useLabourStatus(): Map<string, LabourStatus> {
  return useLiveQuery(async () => {
    const all = await db.movements.filter((m) => !m.voided_at).toArray()
    const latest = new Map<string, LabourStatus>()
    for (const m of all) {
      const cur = latest.get(m.labourer_id)
      if (!cur || m.at > cur.at) latest.set(m.labourer_id, { direction: m.direction, at: m.at })
    }
    return latest
  }, [], new Map<string, LabourStatus>())
}

export function useVisitorsInside(): Visitor[] {
  return useLiveQuery(async () => {
    const rows = await db.visitors.filter((v) => !v.out_at && !v.voided_at).toArray()
    return rows.sort((a, b) => (a.in_at < b.in_at ? 1 : -1))
  }, [], [])
}

export function useVehiclesInside(): Vehicle[] {
  return useLiveQuery(async () => {
    const rows = await db.vehicles.filter((v) => !v.out_at && !v.voided_at).toArray()
    return rows.sort((a, b) => (a.in_at < b.in_at ? 1 : -1))
  }, [], [])
}

export interface TodayEntry {
  key: string
  register: Register
  id: string
  at: string
  direction: Direction
  title: string
  subtitle: string
  photo: string | null
  keepPhoto: boolean
  pending: boolean
  voided: boolean
  mistake: boolean
  flag?: string | null
}

/** Today's IN / OUT events from all three registers, newest first. */
export function useTodayEntries(lang: Lang, t: (k: string, v?: Record<string, string | number>) => string): TodayEntry[] {
  return useLiveQuery(async () => {
    const start = istDayStart()
    const out: TodayEntry[] = []
    const mistakes = new Set((await db.mistakes.toArray()).map((m) => m.entry_id))

    const movements = await db.movements.where('at').aboveOrEqual(start).toArray()
    const ids = [...new Set(movements.map((r) => r.labourer_id))]
    const labs = await db.labourers.bulkGet(ids)
    const byId = new Map(labs.filter(Boolean).map((l) => [l!.id, l!]))
    for (const m of movements) {
      const l = byId.get(m.labourer_id)
      out.push({
        key: `l:${m.id}`, register: 'labour', id: m.id, at: m.at, direction: m.direction,
        title: l ? localName(l, lang) : '?', subtitle: l?.contractor_name ?? '', photo: l?.photo_path ?? null, keepPhoto: true,
        pending: m.pending === 1, voided: Boolean(m.voided_at), mistake: mistakes.has(m.id), flag: m.flag ?? null,
      })
    }

    const visitors = await db.visitors.filter((v) => v.in_at >= start || (v.out_at ?? '') >= start).toArray()
    for (const v of visitors) {
      const title = v.persons > 1 ? `${v.name} (${t('people_count', { n: v.persons })})` : v.name
      const subtitle = [v.company, t(`purpose_${v.purpose}`)].filter(Boolean).join(' · ')
      const base = { register: 'visitor' as const, id: v.id, title, subtitle, photo: v.photo_path, keepPhoto: false, voided: Boolean(v.voided_at), mistake: mistakes.has(v.id) }
      if (v.in_at >= start) out.push({ ...base, key: `v:${v.id}:in`, at: v.in_at, direction: 'in', pending: v.pending === 1 })
      if (v.out_at && v.out_at >= start) out.push({ ...base, key: `v:${v.id}:out`, at: v.out_at, direction: 'out', pending: v.out_pending === 1 })
    }

    const vehicles = await db.vehicles.filter((v) => v.in_at >= start || (v.out_at ?? '') >= start).toArray()
    for (const v of vehicles) {
      const subtitle = [t(`vt_${v.vehicle_type}`), t(`vp_${v.purpose}`), v.driver_name].filter(Boolean).join(' · ')
      const base = { register: 'vehicle' as const, id: v.id, title: v.plate, subtitle, photo: v.plate_photo_path, keepPhoto: false, voided: Boolean(v.voided_at), mistake: mistakes.has(v.id) }
      if (v.in_at >= start) out.push({ ...base, key: `h:${v.id}:in`, at: v.in_at, direction: 'in', pending: v.pending === 1 })
      if (v.out_at && v.out_at >= start) out.push({ ...base, key: `h:${v.id}:out`, at: v.out_at, direction: 'out', pending: v.out_pending === 1 })
    }

    return out.sort((a, b) => (a.at < b.at ? 1 : -1))
  }, [lang], [])
}
