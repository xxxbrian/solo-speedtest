import { expect, test } from 'bun:test'
import { detectLang, matchLang, parseLang } from './detect'

test('detectLang: first supported language wins', () => {
  expect(detectLang(['en-GB', 'zh'])).toBe('en')
  expect(detectLang(['fr', 'zh-TW'])).toBe('zh')
  expect(detectLang(['zh-Hans-CN', 'en'])).toBe('zh')
  expect(detectLang(['ZH_cn'])).toBe('zh')
})
test('detectLang: falls back to English when none match or empty', () => {
  expect(detectLang(['fr', 'de'])).toBe('en')
  expect(detectLang([])).toBe('en')
  expect(detectLang([''])).toBe('en')
})
test('matchLang / parseLang', () => {
  expect(matchLang('zh-Hant')).toBe('zh')
  expect(matchLang('zhx')).toBeNull()
  expect(parseLang('zh')).toBe('zh')
  expect(parseLang('fr')).toBeNull()
  expect(parseLang(null)).toBeNull()
})
