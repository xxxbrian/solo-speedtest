import { detectLang, parseLang, type Lang } from './detect'
import { en, type Dict } from './en'
import { zh } from './zh'

// Language is a viewer preference, not test config: not in the URL, only in localStorage (degrades to this page only if storage fails)
const KEY = 'speedtest.lang'
const read = () => { try { return parseLang(localStorage.getItem(KEY)) } catch { return null } }
const write = (v: Lang | null) => {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch {}
}

const dicts: Record<Lang, Dict> = { en, zh }
const detected = detectLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? ''])

let pref = $state<Lang | null>(read())
// Sync when another tab changes the language
window.addEventListener('storage', (e: StorageEvent) => { if (e.key === KEY || e.key === null) pref = read() })

export const i18n = {
  /** The user's explicit choice; null = auto */
  get pref() { return pref },
  get lang(): Lang { return pref ?? detected },
  get t(): Dict { return dicts[pref ?? detected] },
  set(v: Lang | null) { pref = v; write(v) },
}
