import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accepts, createStaticHandler } from './static'

let dir: string
let handle: (r: Request) => Response
const big = 'console.log("hello");\n'.repeat(200) // compressible

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'static-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>' + '<p>hi</p>'.repeat(100))
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), big)
  writeFileSync(join(dir, 'tiny.txt'), 'ab')
  handle = createStaticHandler(dir)
})
afterAll(() => rmSync(dir, { recursive: true }))

const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  handle(new Request('http://x' + path, { method, headers }))

test('Accept-Encoding negotiation', () => {
  expect(accepts('gzip, br', 'br')).toBe(true)
  expect(accepts('br;q=0, gzip', 'br')).toBe(false)
  expect(accepts('GZIP', 'gzip')).toBe(true)
  expect(accepts(null, 'br')).toBe(false)
  expect(accepts('identity', 'gzip')).toBe(false)
})

test('prefers br, then gzip, else identity; Vary and Content-Length are correct', async () => {
  const br = get('/assets/app-abc123.js', { 'accept-encoding': 'gzip, br' })
  expect(br.headers.get('content-encoding')).toBe('br')
  expect(br.headers.get('vary')).toBe('Accept-Encoding')
  expect(Number(br.headers.get('content-length'))).toBe((await br.arrayBuffer()).byteLength)
  expect(Number(br.headers.get('content-length'))).toBeLessThan(big.length)

  const gz = get('/assets/app-abc123.js', { 'accept-encoding': 'gzip' })
  expect(gz.headers.get('content-encoding')).toBe('gzip')
  expect(Bun.gunzipSync(new Uint8Array(await gz.arrayBuffer()))).toEqual(new TextEncoder().encode(big))

  const raw = get('/assets/app-abc123.js')
  expect(raw.headers.get('content-encoding')).toBeNull()
  expect(await raw.text()).toBe(big)
})

test('cache headers: hashed assets are immutable, index.html is revalidated', () => {
  expect(get('/assets/app-abc123.js').headers.get('cache-control')).toContain('immutable')
  expect(get('/').headers.get('cache-control')).toBe('no-cache')
})

test('ETag / 304; each encoding variant has its own ETag', () => {
  const a = get('/', { 'accept-encoding': 'br' })
  const etag = a.headers.get('etag')!
  const hit = get('/', { 'accept-encoding': 'br', 'if-none-match': etag })
  expect(hit.status).toBe(304)
  expect(hit.headers.get('cache-control')).toBe('no-cache')
  expect(get('/', { 'accept-encoding': 'br', 'if-none-match': '"nope"' }).status).toBe(200)
  expect(get('/', { 'accept-encoding': 'gzip' }).headers.get('etag')).not.toBe(etag)
})

test('tiny files are not compressed', () => {
  const r = get('/tiny.txt', { 'accept-encoding': 'br, gzip' })
  expect(r.headers.get('content-encoding')).toBeNull()
  expect(r.headers.get('vary')).toBeNull()
})

test('HEAD has headers but no body', async () => {
  const r = get('/', { 'accept-encoding': 'br' }, 'HEAD')
  expect(r.status).toBe(200)
  expect(Number(r.headers.get('content-length'))).toBeGreaterThan(0)
  expect(await r.text()).toBe('')
})

test('SPA fallback and 404 rules', () => {
  expect(get('/some/page').status).toBe(200) // page-like path -> index.html
  expect(get('/assets/missing.js').status).toBe(404)
  expect(get('/missing.css').status).toBe(404)
  expect(get('/api/unknown').status).toBe(404)
  expect(get('/../../etc/passwd').status).toBe(200) // only ever falls back to index.html, never reads elsewhere on disk
})
