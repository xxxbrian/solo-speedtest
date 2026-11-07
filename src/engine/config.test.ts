import { expect, test } from 'bun:test'
import { canonicalSearch, DEFAULTS, parseSearch, toSearch } from './config'

test('canonical URLs are unchanged', () => {
  for (const s of ['', '?auto=1', '?test=up,down', '?dur=5&conn=2&rounds=0&gap=30', '?up.dur=20&down.conn=6'])
    expect(canonicalSearch(s)).toBe(s)
})

test('order, case, defaults, encoding, unknown params', () => {
  expect(canonicalSearch('?rounds=0&AUTO=TRUE&utm=x')).toBe('?auto=1&rounds=0')
  expect(canonicalSearch('?Test=Up%2CDown&DUR=010')).toBe('?test=up,down')
  expect(canonicalSearch('?dur=500&conn=0')).toBe('?dur=120&conn=1')
  expect(canonicalSearch('?conn=4&up.conn=3')).toBe('')
  expect(canonicalSearch('?up.conn=4&down.conn=4')).toBe('?conn=4')
  expect(canonicalSearch('?dur=5&down.dur=8')).toBe('?down.dur=8&up.dur=5')
  expect(canonicalSearch('?dur=3&dur=9')).toBe('?dur=3') // first duplicate wins
  expect(canonicalSearch('?test=')).toBe('?test=') // an empty list is a valid explicit choice
  expect(canonicalSearch('?test=down,bogus,down')).toBe('?test=down')
  expect(canonicalSearch('?pings=abc&gap=')).toBe('')
})

test('idempotent and meaning-preserving (random input)', () => {
  const keys = ['auto', 'AUTO', 'test', 'dur', 'conn', 'down.dur', 'up.dur', 'down.conn', 'up.conn', 'warmup', 'pings', 'rounds', 'gap', 'x']
  const vals = ['', '0', '1', '3', '4', '10', '010', '999', '-5', 'abc', 'true', 'TRUE', 'up,down', 'Ping,UP', 'down,down', '1e2', ' 5 ']
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  for (let i = 0; i < 3000; i++) {
    const n = Math.floor(Math.random() * 6)
    const raw = '?' + Array.from({ length: n }, () => `${pick(keys)}=${pick(vals)}`).join('&')
    const once = canonicalSearch(raw)
    expect(canonicalSearch(once)).toBe(once)
    expect(parseSearch(once)).toEqual(parseSearch(raw))
  }
})

test('default config maps to an empty query string', () => {
  expect(toSearch(DEFAULTS)).toBe('')
})
