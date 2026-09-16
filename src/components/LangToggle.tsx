import { LANG_LABELS, useT } from '../lib/i18n'
import type { Lang } from '../lib/types'

export default function LangToggle() {
  const { lang, setLang } = useT()
  return (
    <div className="grid grid-cols-4 gap-2">
      {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
        <button key={l} type="button" onClick={() => setLang(l)}
          className={`min-h-14 rounded-xl border-2 text-base font-bold ${lang === l ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-300 bg-white'}`}>
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  )
}
