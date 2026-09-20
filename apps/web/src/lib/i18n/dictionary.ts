import type zh from './locales/zh'

/** Widens the literal types produced by `as const` so translations only need the same keys. */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>
}

/** Every locale must provide exactly these sections and keys. */
export type Dictionary = Widen<typeof zh>

/** Dot-separated paths to every leaf string, e.g. `home.title` or `login.email`. */
export type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafPaths<T[K]>}`
}[keyof T & string]

export type TranslationKey = LeafPaths<Dictionary>

/** Values substituted into `{placeholder}` slots. */
export type TranslationVars = Record<string, string | number>
