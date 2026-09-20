'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  htmlLangOf,
  normalizeLocale,
  type Locale,
} from './config'
import type { Dictionary, TranslationKey, TranslationVars } from './dictionary'
import zh from './locales/zh'
import en from './locales/en'
import de from './locales/de'
import fr from './locales/fr'
import it from './locales/it'
import ru from './locales/ru'
import es from './locales/es'
import ja from './locales/ja'

export { LOCALES, LOCALE_META, isLocale, normalizeLocale, htmlLangOf, localeMeta } from './config'
export type { Locale } from './config'

const DICTIONARIES: Record<Locale, Dictionary> = { zh, en, de, fr, it, ru, es, ja }

function lookup(dictionary: Dictionary, path: string): string | undefined {
  const found = path.split('.').reduce<unknown>((accumulator, part) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[part]
    }
    return undefined
  }, dictionary)
  return typeof found === 'string' ? found : undefined
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  )
}

export type Translate = (key: TranslationKey, vars?: TranslationVars) => string

export function createTranslator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
  return (key, vars) => {
    // Falling back to Chinese keeps real text on screen if a locale ever misses a key.
    const value = lookup(dictionary, key) ?? lookup(DICTIONARIES[DEFAULT_LOCALE], key) ?? key
    return interpolate(value, vars)
  }
}

interface I18nValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale?: Locale
  children: React.ReactNode
}) {
  // Seeded from the cookie the server read, so the first paint is already translated.
  const [locale, setLocaleState] = useState<Locale>(normalizeLocale(initialLocale))

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next)
      // Read back by the root layout on the next request - keeps SSR in sync.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // Storage may be unavailable (private mode); the in-memory value still applies.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = htmlLangOf(locale)
  }, [locale])

  // Heals the rare case where localStorage survived but the cookie did not. Goes through
  // setLocale (not setLocaleState) so the cookie is written back too - otherwise the server
  // would keep rendering the stale language and the page would flip on every load.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
      if (stored && normalizeLocale(stored) !== locale) setLocale(normalizeLocale(stored))
    } catch {
      // ignore
    }
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: createTranslator(locale) }),
    [locale, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}
