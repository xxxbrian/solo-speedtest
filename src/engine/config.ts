// Single source of config: URL params and UI settings both go through normalize, so there is one set of rules.
//
// URL params (all optional):
// Canonicalization: see parseSearch / toSearch; the server redirects non-canonical URLs to canonicalSearch.
//   auto=1            start automatically when the page opens
//   test=ping,down,up tests to run and their order (any subset)
//   dur=10            measurement seconds per direction (shared by down/up)
//   down.dur / up.dur override seconds for one direction
//   conn=4            concurrent connections (shared by down/up)
//   down.conn / up.conn override connections for one direction
//   warmup=2          warm-up seconds per direction (not counted)
//   pings=20          number of latency samples
//   rounds=1          number of rounds, 0 = unlimited
//   gap=5             seconds between rounds

export type Phase = 'ping' | 'down' | 'up'

export interface Config {
  auto: boolean
  test: Phase[]
  dur: { down: number; up: number }
  conn: { down: number; up: number }
  warmup: number
  pings: number
  rounds: number
  gap: number
}

export const DEFAULTS: Config = {
  auto: false,
  test: ['ping', 'down', 'up'],
  dur: { down: 10, up: 10 },
  conn: { down: 4, up: 3 },
  warmup: 2,
  pings: 20,
  rounds: 1,
  gap: 5,
}

const PHASES: Phase[] = ['ping', 'down', 'up']

/** Value ranges: shared by normalize and the UI controls */
export const LIMITS = {
  dur: [1, 120], conn: [1, 32], warmup: [0, 30], pings: [3, 200], rounds: [0, 1000], gap: [0, 3600],
} as const

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def
}

const bool = (v: unknown, def: boolean) => {
  if (v === true || v === '1' || v === 'true') return true
  if (v === false || v === '0' || v === 'false') return false
  return def
}

const phases = (v: unknown, def: Phase[]): Phase[] => {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null
  if (!list) return def
  const out: Phase[] = []
  for (const p of list) {
    const s = String(p).trim()
    if ((PHASES as string[]).includes(s) && !out.includes(s as Phase)) out.push(s as Phase)
  }
  return out
}

/** Lenient input -> valid config. Shared by the UI and the URL. */
export function normalize(raw: any): Config {
  const d = DEFAULTS
  const dur = int(raw.dur?.all ?? raw.durAll, NaN, 1, 120)
  const conn = int(raw.conn?.all ?? raw.connAll, NaN, 1, 32)
  const pick = (v: unknown, all: number, def: number, lo: number, hi: number) =>
    int(v, Number.isNaN(all) ? def : all, lo, hi)
  return {
    auto: bool(raw.auto, d.auto),
    test: phases(raw.test, d.test),
    dur: {
      down: pick(raw.dur?.down, dur, d.dur.down, 1, 120),
      up: pick(raw.dur?.up, dur, d.dur.up, 1, 120),
    },
    conn: {
      down: pick(raw.conn?.down, conn, d.conn.down, 1, 32),
      up: pick(raw.conn?.up, conn, d.conn.up, 1, 32),
    },
    warmup: int(raw.warmup, d.warmup, 0, 30),
    pings: int(raw.pings, d.pings, 3, 200),
    rounds: int(raw.rounds, d.rounds, 0, 1000),
    gap: int(raw.gap, d.gap, 0, 3600),
  }
}

/**
 * Lenient parsing: param names are case-insensitive; auto/test values are case-insensitive; the first of a repeated param wins; unknown params are ignored.
 * Shared by the server (redirects) and the browser (UI), so it must not depend on any DOM API.
 */
export function parseSearch(search: string): Config {
  const q = new Map<string, string>()
  for (const [k, v] of new URLSearchParams(search)) {
    const key = k.trim().toLowerCase()
    if (!q.has(key)) q.set(key, v)
  }
  const lc = (v?: string) => v?.trim().toLowerCase()
  return normalize({
    auto: lc(q.get('auto')),
    test: lc(q.get('test')),
    dur: { all: q.get('dur'), down: q.get('down.dur'), up: q.get('up.dur') },
    conn: { all: q.get('conn'), down: q.get('down.conn'), up: q.get('up.conn') },
    warmup: q.get('warmup'),
    pings: q.get('pings'),
    rounds: q.get('rounds'),
    gap: q.get('gap'),
  })
}

/**
 * Canonical form (unique): fixed key order; params equal to the default are omitted; no percent-encoding (values only contain letters, digits and commas).
 * When down and up are equal, dur/conn is written as one param; otherwise only the down.* / up.* values that differ from the default are written.
 */
export function toSearch(c: Config): string {
  const d = DEFAULTS
  const parts: string[] = []
  const add = (k: string, v: string | number) => parts.push(`${k}=${v}`)
  if (c.auto) add('auto', 1)
  if (c.test.join() !== d.test.join()) add('test', c.test.join(','))
  for (const k of ['dur', 'conn'] as const) {
    const { down, up } = c[k]
    if (down === up) {
      if (down !== d[k].down || up !== d[k].up) add(k, down)
    } else {
      if (down !== d[k].down) add(`down.${k}`, down)
      if (up !== d[k].up) add(`up.${k}`, up)
    }
  }
  for (const k of ['warmup', 'pings', 'rounds', 'gap'] as const) {
    if (c[k] !== d[k]) add(k, c[k])
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

/** Any query string -> canonical query string (leading ?, empty string when there are no params) */
export const canonicalSearch = (search: string) => toSearch(parseSearch(search))
