import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../lib/i18n'

export default function TopBar({ title, back = true, right, onBack }: { title: string; back?: boolean; right?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate()
  const { t } = useT()
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-gray-200 bg-white px-2 py-2">
      {back ? (
        <button type="button" aria-label={t('back')} onClick={onBack ?? (() => nav(-1))} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-3xl active:bg-gray-100">
          ‹
        </button>
      ) : <span className="w-2" />}
      <h1 className="flex-1 truncate text-2xl font-bold">{title}</h1>
      {right}
    </header>
  )
}
