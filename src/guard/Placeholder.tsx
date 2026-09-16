import TopBar from '../components/TopBar'
import { useT } from '../lib/i18n'

export default function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useT()
  return (
    <div className="min-h-screen">
      <TopBar title={t(titleKey)} />
      <p className="p-8 text-center text-2xl text-gray-500">{t('coming_soon')}</p>
    </div>
  )
}
