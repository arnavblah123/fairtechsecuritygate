// How a labourer's name is shown on the phone: the guard's script first, English underneath.
import { devanagariToGujarati, hasIndicScript, nativeName } from '../../api/_lib/translit'
import type { Labourer, Lang } from './types'

/** Name in the guard's language. hi / mr use the stored Devanagari; gu is derived from it. */
export function localName(l: Pick<Labourer, 'name' | 'name_hi'>, lang: Lang): string {
  if (lang === 'en') return l.name
  const hi = l.name_hi?.trim() || nativeName(l.name)
  return lang === 'gu' ? devanagariToGujarati(hi) : hi
}

/** The English name to show as a second line, or null when it would repeat the main line. */
export function secondaryName(l: Pick<Labourer, 'name' | 'name_hi'>, lang: Lang): string | null {
  const main = localName(l, lang)
  return main === l.name || (lang === 'en' && !l.name_hi) ? null : l.name
}

/** Search text matches the English name, the Devanagari name or the Gujarati name. */
export function nameMatches(l: Pick<Labourer, 'name' | 'name_hi'>, needle: string): boolean {
  const n = needle.trim().toLowerCase()
  if (!n) return true
  if (l.name.toLowerCase().includes(n)) return true
  const hi = l.name_hi ?? ''
  if (hi.includes(n)) return true
  return hasIndicScript(n) && devanagariToGujarati(hi).includes(n)
}

export { nativeName }
