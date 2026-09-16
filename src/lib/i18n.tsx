import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import en from '../locales/en.json'
import hi from '../locales/hi.json'
import mr from '../locales/mr.json'
import gu from '../locales/gu.json'
import { getLang, setLang as persistLang } from './session'
import type { Lang } from './types'

const dicts: Record<Lang, Record<string, string>> = { en, hi, mr, gu }

export const LANG_LABELS: Record<Lang, string> = { en: 'English', hi: 'हिंदी', mr: 'मराठी', gu: 'ગુજરાતી' }

type Vars = Record<string, string | number>
interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Vars) => string
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang())
  const setLang = useCallback((l: Lang) => { persistLang(l); setLangState(l) }, [])
  const t = useCallback((key: string, vars?: Vars) => {
    let s = dicts[lang][key] ?? dicts.en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }, [lang])
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useT(): I18n {
  const c = useContext(Ctx)
  if (!c) throw new Error('I18nProvider missing')
  return c
}
