import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import LangToggle from '../components/LangToggle'
import { useT } from '../lib/i18n'
import { DEFAULT_LANG, setLockedUnit } from '../lib/session'
import type { UnitId } from '../lib/types'

/** First login on this phone only. The unit is locked server-side at first successful login. */
export default function UnitSelect() {
  const { t, setLang } = useT()
  const nav = useNavigate()
  const pick = (u: UnitId) => {
    setLockedUnit(u)
    setLang(DEFAULT_LANG[u])
    nav('/login', { replace: true })
  }
  return (
    <div className="flex min-h-screen flex-col gap-6 p-4">
      <h1 className="mt-6 text-center text-3xl font-bold">{t('app_name')}</h1>
      <LangToggle />
      <p className="text-center text-2xl">{t('choose_unit')}</p>
      <BigButton size="xl" icon="🏭" onClick={() => pick('dehu')}>{t('unit_dehu')}</BigButton>
      <BigButton size="xl" icon="🏭" onClick={() => pick('savli')}>{t('unit_savli')}</BigButton>
    </div>
  )
}
