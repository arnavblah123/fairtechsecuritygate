import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LangToggle from '../components/LangToggle'
import PinPad from '../components/PinPad'
import { useT } from '../lib/i18n'
import { getDeviceId, getLockedUnit, setGuardSession, setLockedUnit } from '../lib/session'
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabase'
import { clearCaches, kvGet } from '../lib/db'
import { refreshCaches, usePendingCount } from '../lib/sync'
import type { GuardSession, Lang, Unit } from '../lib/types'

interface LoginResponse {
  session: { access_token: string; refresh_token: string }
  guard: { id: string; name: string; language: Lang | null }
  unit: Unit
  error?: string
}

export async function guardLogin(pin: string, unitId: string | null): Promise<LoginResponse> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/guard-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ device_id: getDeviceId(), unit_id: unitId, pin, device_label: navigator.userAgent.slice(0, 80) }),
  })
  const body = (await res.json().catch(() => ({}))) as LoginResponse
  if (!res.ok) throw new Error(body.error ?? 'server')
  return body
}

export default function Login() {
  const { t, setLang } = useT()
  const nav = useNavigate()
  const pending = usePendingCount()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const unit = getLockedUnit()

  const submit = async (pin: string) => {
    setError(null)
    if (!navigator.onLine) { setError(t('need_internet')); setResetKey((k) => k + 1); return }
    setBusy(true)
    try {
      const r = await guardLogin(pin, unit)
      await supabase.auth.setSession(r.session)
      // The server decides the unit (device lock). If it differs from what the phone thinks, follow the server.
      const prevUnit = await kvGet<string>('cache.unit')
      if (prevUnit && prevUnit !== r.unit.id) await clearCaches()
      setLockedUnit(r.unit.id)
      if (r.guard.language) setLang(r.guard.language)
      const s: GuardSession = {
        guardId: r.guard.id, guardName: r.guard.name, unitId: r.unit.id, unitName: r.unit.name,
        unitHeadName: r.unit.unit_head_name, unitHeadPhone: r.unit.unit_head_phone, loggedInAt: new Date().toISOString(),
      }
      setGuardSession(s)
      void refreshCaches(r.unit.id)
      nav('/', { replace: true })
    } catch (e) {
      const code = (e as Error).message
      const map: Record<string, string> = { bad_pin: 'wrong_pin', locked: 'locked', device_disabled: 'device_disabled', unit_required: 'error_try_again' }
      setError(t(map[code] ?? (navigator.onLine ? 'error_try_again' : 'need_internet')))
      setResetKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 p-3">
      <h1 className="mt-1 text-center text-2xl font-bold">{t("app_name")}</h1>
      <p className="text-center text-lg text-gray-600">{unit === 'dehu' ? t('unit_dehu') : t('unit_savli')}</p>
      <LangToggle />
      <p className="text-center text-2xl">{busy ? t('logging_in') : t('enter_pin')}</p>
      <PinPad onComplete={(p) => void submit(p)} disabled={busy} resetKey={resetKey} />
      {error && <p className="rounded-2xl bg-red-100 p-4 text-center text-xl font-bold text-red-800">{error}</p>}
      {pending > 0 && <p className="text-center text-lg text-orange-700">{t('pending_count', { n: pending })}</p>}
    </div>
  )
}
