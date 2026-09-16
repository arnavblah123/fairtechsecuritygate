export const TZ = 'Asia/Kolkata'

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true })
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export const fmtTime = (iso: string | Date) => timeFmt.format(new Date(iso))
export const fmtDate = (iso: string | Date) => dateFmt.format(new Date(iso))
export const fmtDateTime = (iso: string | Date) => dateTimeFmt.format(new Date(iso))
/** yyyy-mm-dd in IST */
export const istDate = (d: Date = new Date()) => isoDateFmt.format(d)

/** ISO timestamp of 00:00 IST today (IST is UTC+5:30, no DST). */
export function istDayStart(d: Date = new Date()): string {
  return new Date(`${istDate(d)}T00:00:00+05:30`).toISOString()
}

export function minutesBetween(a: string | Date, b: string | Date = new Date()): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
}

export function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
