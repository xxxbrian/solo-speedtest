import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// Static assets: read into memory and precompressed (br + gzip) once at startup; a request is just a lookup and negotiation, no disk I/O and no CPU cost.
// The directory is an allowlist (only files found at startup are served), so there is no path traversal. Restart the server after rebuilding dist.

type Bytes = Uint8Array<ArrayBuffer>

interface Entry {
  type: string
  cache: string
  etag: string // strong ETag from a content hash; compressed variants get a suffix
  raw: Bytes
  br?: Bytes
  gz?: Bytes
}

const COMPRESSIBLE = /^(text\/|application\/(json|xml)|image\/svg\+xml)/
const MIN_COMPRESS = 256 // compressing tiny files is pointless
const IMMUTABLE = 'public, max-age=31536000, immutable' // filenames carry a content hash, so they never change
const REVALIDATE = 'no-cache' // revalidate the ETag every time; 304 if unchanged

function* walk(dir: string, prefix = ''): Generator<[string, string]> {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${d.name}`
    if (d.isDirectory()) yield* walk(join(dir, d.name), rel)
    else yield [rel, join(dir, d.name)]
  }
}

/** Whether Accept-Encoding accepts an encoding (handles q=0) */
export function accepts(header: string | null, enc: string): boolean {
  if (!header) return false
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';')
    if (name.trim().toLowerCase() !== enc) continue
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    return !q || Number(q.slice(2)) > 0
  }
  return false
}

const matches = (inm: string | null, etag: string) =>
  !!inm && (inm.trim() === '*' || inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag))

export function createStaticHandler(dir: string) {
  const files = new Map<string, Entry>()
  let rawTotal = 0, brTotal = 0

  if (!existsSync(dir)) console.warn(`static: ${dir} does not exist (run bun run build first)`)
  else
    for (const [url, path] of walk(dir)) {
      const raw = new Uint8Array(readFileSync(path))
      const type = Bun.file(path).type
      const e: Entry = {
        type,
        cache: url.startsWith('/assets/') ? IMMUTABLE : REVALIDATE,
        etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`,
        raw,
      }
      if (COMPRESSIBLE.test(type) && raw.length >= MIN_COMPRESS) {
        const br = brotliCompressSync(raw, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length },
        })
        const gz = gzipSync(raw, { level: 9 })
        if (br.length < raw.length) e.br = new Uint8Array(br)
        if (gz.length < raw.length) e.gz = new Uint8Array(gz)
      }
      files.set(url, e)
      rawTotal += raw.length
      brTotal += (e.br ?? raw).length
    }
  if (files.size) console.log(`static: ${files.size} files, ${(rawTotal / 1024).toFixed(1)} KB (br ${(brTotal / 1024).toFixed(1)} KB)`)

  const index = files.get('/index.html')
  const notFound = () => new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  return (req: Request): Response => {
    let path = new URL(req.url).pathname
    if (path === '/') path = '/index.html'
    let e = files.get(path)
    if (!e) {
      // SPA fallback: only for page-like paths; missing assets, API routes and paths with an extension must be 404
      if (path.startsWith('/api/') || path.startsWith('/assets/') || /\.[a-z0-9]+$/i.test(path)) return notFound()
      e = index
    }
    if (!e) return notFound()

    const ae = req.headers.get('accept-encoding')
    const variant = e.br && accepts(ae, 'br') ? 'br' : e.gz && accepts(ae, 'gzip') ? 'gz' : 'raw'
    const body = variant === 'br' ? e.br! : variant === 'gz' ? e.gz! : e.raw
    const etag = variant === 'raw' ? e.etag : `${e.etag.slice(0, -1)}-${variant}"`

    const headers: Record<string, string> = { ETag: etag, 'Cache-Control': e.cache }
    if (e.br || e.gz) headers.Vary = 'Accept-Encoding'
    if (matches(req.headers.get('if-none-match'), etag)) return new Response(null, { status: 304, headers })

    headers['Content-Type'] = e.type
    headers['Content-Length'] = String(body.length)
    if (variant !== 'raw') headers['Content-Encoding'] = variant === 'br' ? 'br' : 'gzip'
    return new Response(req.method === 'HEAD' ? null : body, { headers })
  }
}
