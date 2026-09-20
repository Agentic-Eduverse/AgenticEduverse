// Locale catalogue for the app UI.
//
// The selected locale is persisted twice on purpose:
//  - localStorage, so client-side navigation keeps it without a round trip;
//  - a cookie, so the root layout (a server component) can render the very first paint in
//    the right language instead of flashing the default one.

export const LOCALES = ['zh', 'en', 'de', 'fr', 'it', 'ru', 'es', 'ja'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'zh'

/** Cookie read by the root layout; must stay in sync with the client writer. */
export const LOCALE_COOKIE = 'eduverse_locale'
export const LOCALE_STORAGE_KEY = 'eduverse:locale'

export interface LocaleMeta {
  code: Locale
  /** Endonym - shown in the switcher, the way speakers of that language expect. */
  native: string
  /** Chinese name, handy when the interface language is Chinese. */
  zhName: string
  /** BCP 47 tag for <html lang> and date formatting. */
  htmlLang: string
}

export const LOCALE_META: LocaleMeta[] = [
  { code: 'zh', native: '简体中文', zhName: '中文', htmlLang: 'zh-CN' },
  { code: 'en', native: 'English', zhName: '英语', htmlLang: 'en' },
  { code: 'de', native: 'Deutsch', zhName: '德语', htmlLang: 'de' },
  { code: 'fr', native: 'Français', zhName: '法语', htmlLang: 'fr' },
  { code: 'it', native: 'Italiano', zhName: '意大利语', htmlLang: 'it' },
  { code: 'ru', native: 'Русский', zhName: '俄语', htmlLang: 'ru' },
  { code: 'es', native: 'Español', zhName: '西班牙语', htmlLang: 'es' },
  { code: 'ja', native: '日本語', zhName: '日语', htmlLang: 'ja' },
]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export function htmlLangOf(locale: Locale): string {
  return LOCALE_META.find((item) => item.code === locale)?.htmlLang ?? 'zh-CN'
}

export function localeMeta(locale: Locale): LocaleMeta {
  return LOCALE_META.find((item) => item.code === locale) ?? LOCALE_META[0]
}
