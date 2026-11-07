import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const PORT = Number(process.env.PORT ?? 3000)
const MAX_DOWNLOAD = 1024 ** 4 // per-request download cap of 1 TiB; in practice the client aborts
const CHUNK = 256 * 1024

// Reused chunk: generated once and shared by all connections (incompressible random data, so intermediaries can't inflate results by compressing)
const chunk = new Uint8Array(CHUNK)
for (let o = 0; o < CHUNK; o += 65536) crypto.getRandomValues(chunk.subarray(o, o + 65536))

const noStore = {
  'Cache-Control': 'no-store, no-transform',
  'Content-Encoding': 'identity',
}

const app = new Hono()

// Download: pull-based for backpressure, the same memory is sent repeatedly
app.get('/api/download', (c) => {
  const q = Number(c.req.query('bytes'))
  let remaining = Number.isFinite(q) && q > 0 ? Math.min(q, MAX_DOWNLOAD) : MAX_DOWNLOAD
  const body = new ReadableStream<Uint8Array>(
    {
      pull(ctrl) {
        if (remaining <= 0) return ctrl.close()
        const n = Math.min(remaining, CHUNK)
        remaining -= n
        ctrl.enqueue(n === CHUNK ? chunk : chunk.subarray(0, n))
      },
    },
    { highWaterMark: 4 }, // counted in chunks; a small water mark is enough, Bun pulls as the socket becomes writable
  )
  return new Response(body, {
    headers: { ...noStore, 'Content-Type': 'application/octet-stream' },
  })
})

// Upload: stream and discard immediately, no buffering; return the bytes actually received as confirmation
app.post('/api/upload', async (c) => {
  const body = c.req.raw.body
  let received = 0
  if (body) {
    const reader = body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
    }
  }
  return c.json({ received }, 200, noStore)
})

// Latency: empty response
app.all('/api/ping', (c) => c.body(null, 204, noStore))

// Static pages (Svelte build output)
app.use('*', serveStatic({ root: './dist' }))
app.get('*', serveStatic({ path: './dist/index.html' }))

export default {
  port: PORT,
  fetch: app.fetch,
  maxRequestBodySize: 1024 ** 4, // no practical upload limit (streamed and discarded)
  idleTimeout: 60,
}
console.log(`speedtest listening on :${PORT}`)
