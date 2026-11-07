// Pure functions with no DOM / Svelte dependency, easy to unit-test
export const LANGS = ['en', 'zh'] as const
export type Lang = (typeof LANGS)[number]

/** Each language's own name, shown the same in every UI language */
export const LANG_NAMES: Record<Lang, string> = { en: 'EN', zh: '中文' }

/** Stored value -> a valid explicit choice; anything else means "auto" */
export const parseLang = (v: unknown): Lang | null => (v === 'en' || v === 'zh' ? v : null)

/** 'zh-TW' / 'zh_CN' / 'ZH-Hans' -> 'zh'; unsupported language -> null */
export function matchLang(tag: string): Lang | null {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
  return (LANGS as readonly string[]).includes(primary) ? (primary as Lang) : null
}

/** First supported language in preference order, else English */
export function detectLang(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const m = matchLang(tag)
    if (m) return m
  }
  return 'en'
}
