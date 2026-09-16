import type { GuardSession, Lang, UnitId } from './types'

const DEVICE_KEY = 'gate.device_id'
const UNIT_KEY = 'gate.unit_id'
const LANG_KEY = 'gate.lang'
const SESSION_KEY = 'gate.session'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string | null) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* ignore */ }
}

export function getDeviceId(): string {
  let id = safeGet(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    safeSet(DEVICE_KEY, id)
  }
  return id
}

export function getLockedUnit(): UnitId | null {
  const u = safeGet(UNIT_KEY)
  return u === 'dehu' || u === 'savli' ? u : null
}
export function setLockedUnit(unit: UnitId | null) {
  safeSet(UNIT_KEY, unit)
}

export const DEFAULT_LANG: Record<UnitId, Lang> = { dehu: 'mr', savli: 'gu' }

export function getLang(): Lang {
  const l = safeGet(LANG_KEY)
  if (l === 'en' || l === 'hi' || l === 'mr' || l === 'gu') return l
  const unit = getLockedUnit()
  return unit ? DEFAULT_LANG[unit] : 'hi'
}
export function setLang(lang: Lang) {
  safeSet(LANG_KEY, lang)
}

export function getGuardSession(): GuardSession | null {
  const raw = safeGet(SESSION_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as GuardSession } catch { return null }
}
export function setGuardSession(s: GuardSession | null) {
  safeSet(SESSION_KEY, s ? JSON.stringify(s) : null)
  window.dispatchEvent(new Event('gate:session'))
}
