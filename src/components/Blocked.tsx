import BigButton from './BigButton'
import { useT } from '../lib/i18n'

/** Full-screen blacklist warning. The only way out is Back; nothing is saved. */
export default function Blocked({ headName, headPhone, reason, onBack }: { headName: string | null; headPhone: string | null; reason?: string | null; onBack: () => void }) {
  const { t } = useT()
  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 bg-red-700 p-6 text-center text-white">
      <div className="text-7xl">⛔</div>
      <div className="text-4xl font-bold">{t('blacklisted')}</div>
      <p className="text-2xl">{t('blacklist_call', { name: headName || t('office') })}</p>
      {reason && <p className="text-xl opacity-90">{reason}</p>}
      {headPhone && (
        <a href={`tel:${headPhone}`} className="btn btn-xl bg-white text-red-800">📞 {t('call')} {headPhone}</a>
      )}
      <BigButton size="xl" variant="plain" icon="‹" onClick={onBack}>{t('back')}</BigButton>
    </div>
  )
}
