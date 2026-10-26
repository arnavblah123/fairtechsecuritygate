/** SQL expression for 00:00 today in IST as timestamptz. */
export const IST_DAY_START = `(date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`

const TZ = 'Asia/Kolkata'
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const isoDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export const fmtTimeIst = (d: string | Date | null | undefined) => (d ? timeFmt.format(new Date(d)) : '')
export const fmtDateTimeIst = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : '')
export const fmtDayIst = (d: string | Date) => dayFmt.format(new Date(d))
/** yyyy-mm-dd of a moment in IST */
export const istDate = (d: Date = new Date()) => isoDateFmt.format(d)
/** [start, end) of an IST calendar day (yyyy-mm-dd) as ISO timestamps. IST is UTC+5:30, no DST. */
export function istDayRange(day: string): [string, string] {
  const start = new Date(`${day}T00:00:00+05:30`)
  return [start.toISOString(), new Date(start.getTime() + 86400_000).toISOString()]
}
export function fmtDurationMin(mins: number): string {
  const m = Math.max(0, Math.round(mins))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}
