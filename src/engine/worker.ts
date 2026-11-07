/// <reference lib="webworker" />
import type { Config, Phase } from './config'
import type { FromWorker, PingResult, Stage, ToWorker } from './types'

// The engine produces no user-facing text: it throws errors with codes and the UI translates them
class EngineError extends Error {
  constructor(readonly code: 'http' | 'network', readonly dir: 'down' | 'up', readonly status?: number) {
    super(`${dir} ${code}${status ? ` ${status}` : ''}`)
  }
}

const post = (m: FromWorker) => self.postMessage(m)
const now = () => performance.now() // monotonic clock
const sleep = (ms: number, s: AbortSignal) =>
  new Promise<void>((res) => {
    if (s.aborted) return res()
    const t = setTimeout(res, ms)
    s.addEventListener('abort', () => (clearTimeout(t), res()), { once: true })
  })

const TICK_MS = 50 // internal sampling
const UI_MS = 250 // push to the UI
const LIVE_WINDOW_MS = 1000
const mbps = (bytes: number, ms: number) => (ms > 0 ? (bytes * 8) / ms / 1000 : 0)

// ---- Reused upload data: 1 MiB of random data generated once, assembled into a 16 MiB Blob (a Blob only holds references, no copying)
const UP_BLOB = (() => {
  const buf = new Uint8Array(1 << 20)
  for (let o = 0; o < buf.length; o += 65536) crypto.getRandomValues(buf.subarray(o, o + 65536))
  return new Blob(Array.from({ length: 16 }, () => buf))
})()

interface Counter { bytes: number; confirmed: number }

// ---- Download: Fetch stream, read chunk by chunk and only add up lengths (read and discard, backpressure comes for free)
async function downloadLoop(sig: AbortSignal, c: Counter) {
  while (!sig.aborted) {
    try {
      const res = await fetch(`/api/download?_=${Math.random()}`, { signal: sig, cache: 'no-store' })
      if (!res.ok || !res.body) throw new EngineError('http', 'down', res.status)
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        c.bytes += value.byteLength
      }
    } catch (e) {
      if (sig.aborted) return
      throw e instanceof EngineError ? e : new EngineError('network', 'down')
    }
  }
}

// ---- Upload: count bytes from XHR progress events; once a request completes, correct its count with the server-confirmed value
function uploadLoop(sig: AbortSignal, c: Counter) {
  return new Promise<void>((resolve, reject) => {
    const next = () => {
      if (sig.aborted) return resolve()
      const xhr = new XMLHttpRequest()
      let sent = 0
      xhr.open('POST', `/api/upload?_=${Math.random()}`)
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        c.bytes += e.loaded - sent
        sent = e.loaded
      }
      xhr.onload = () => {
        if (xhr.status !== 200) return reject(new EngineError('http', 'up', xhr.status))
        let got = sent
        try { got = JSON.parse(xhr.responseText).received } catch {}
        c.bytes += got - sent // correction: trust what the server actually received
        c.confirmed += got
        next()
      }
      xhr.onerror = () => (sig.aborted ? resolve() : reject(new EngineError('network', 'up')))
      const onAbort = () => xhr.abort()
      sig.addEventListener('abort', onAbort, { once: true })
      xhr.onabort = () => resolve()
      xhr.send(UP_BLOB)
    }
    next()
  })
}

// ---- Throughput: warm-up and measurement are separate; the boundary time and byte count are taken in the same tick
async function throughput(
  dir: 'down' | 'up', cfg: Config, round: number, stop: AbortSignal,
) {
  const n = cfg.conn[dir], dur = cfg.dur[dir] * 1000, warm = cfg.warmup * 1000
  const c: Counter = { bytes: 0, confirmed: 0 }
  const ac = new AbortController()
  const sig = AbortSignal.any([ac.signal, stop])
  const loop = dir === 'down' ? downloadLoop : uploadLoop
  let failure: unknown
  const workers = Array.from({ length: n }, () =>
    loop(sig, c).catch((e) => { failure ??= e; ac.abort() }),
  )

  const t0 = now()
  const samples: [number, number][] = [] // [t, bytes]
  let base: [number, number] | null = warm === 0 ? [t0, 0] : null
  let lastUi = 0, end: [number, number] = [t0, 0]
  while (!sig.aborted) {
    await sleep(TICK_MS, sig)
    const t = now(), b = c.bytes, el = t - t0
    samples.push([t, b])
    if (!base && el >= warm) base = [t, b]
    const stage: Stage = base ? 'measure' : 'warmup'
    if (base) end = [t, b]
    if (t - lastUi >= UI_MS) {
      lastUi = t
      while (samples.length > 2 && t - samples[0][0] > LIVE_WINDOW_MS) samples.shift()
      const [ts, bs] = samples[0]
      post({
        type: 'state', stage, phase: dir, round,
        progress: Math.min(1, el / (warm + dur)),
        live: mbps(b - bs, t - ts),
      })
    }
    if (el >= warm + dur) break
  }
  ac.abort()
  await Promise.all(workers)
  if (failure) throw failure
  if (stop.aborted || !base) return
  post({
    type: 'result', round, phase: dir,
    mbps: mbps(end[1] - base[1], end[0] - base[0]),
    bytes: end[1] - base[1],
    confirmed: dir === 'up' ? c.confirmed : undefined,
  })
}

// ---- Latency: first a "settle" wait (connections just aborted by the previous phase are still winding down and inflate RTT), then serial sampling
async function probe(stop: AbortSignal): Promise<number | null> {
  const t = now()
  try {
    const r = await fetch(`/api/ping?_=${Math.random()}`, { cache: 'no-store', signal: stop })
    await r.arrayBuffer()
    return now() - t
  } catch {
    return null
  }
}

// RTT is considered settled after 3 consecutive samples close to the best seen; waits at most SETTLE_MAX_MS, never indefinitely
const SETTLE_MAX_MS = 3000
async function settle(stop: AbortSignal) {
  const until = now() + SETTLE_MAX_MS
  let best = Infinity, calm = 0
  while (!stop.aborted && now() < until && calm < 3) {
    const rtt = await probe(stop)
    if (rtt != null) {
      best = Math.min(best, rtt)
      calm = rtt <= best * 1.5 + 0.5 ? calm + 1 : 0
    }
    await sleep(30, stop)
  }
}

// Serial small requests; jitter = mean of adjacent differences; the median resists outliers
async function ping(cfg: Config, round: number, stop: AbortSignal) {
  post({ type: 'state', stage: 'warmup', phase: 'ping', round, progress: 0, live: 0 })
  await settle(stop)
  const rtts: number[] = []
  let lost = 0
  for (let i = 0; i < cfg.pings && !stop.aborted; i++) {
    const rtt = await probe(stop)
    if (stop.aborted) return
    if (rtt == null) lost++
    else {
      rtts.push(rtt)
      post({ type: 'state', stage: 'measure', phase: 'ping', round, progress: (i + 1) / cfg.pings, live: rtt })
    }
    await sleep(30, stop)
  }
  if (!rtts.length) return
  const sorted = [...rtts].sort((a, b) => a - b)
  let j = 0
  for (let i = 1; i < rtts.length; i++) j += Math.abs(rtts[i] - rtts[i - 1])
  const result: PingResult = {
    median: sorted[sorted.length >> 1], min: sorted[0],
    jitter: rtts.length > 1 ? j / (rtts.length - 1) : 0,
    loss: lost / cfg.pings,
  }
  post({ type: 'result', round, phase: 'ping', ping: result })
}

async function run(cfg: Config, stop: AbortSignal) {
  const total = cfg.rounds || Infinity
  for (let r = 1; r <= total && !stop.aborted; r++) {
    for (const p of cfg.test as Phase[]) {
      if (stop.aborted) break
      if (p === 'ping') await ping(cfg, r, stop)
      else await throughput(p, cfg, r, stop)
    }
    if (r < total && !stop.aborted) {
      const until = now() + cfg.gap * 1000
      while (!stop.aborted && now() < until) {
        post({ type: 'state', stage: 'gap', phase: null, round: r, progress: 0, live: 0,
               secondsLeft: Math.ceil((until - now()) / 1000) })
        await sleep(Math.min(UI_MS * 2, Math.max(0, until - now())), stop)
      }
    }
  }
}

let ctl: AbortController | null = null
self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  if (m.type === 'stop') return ctl?.abort()
  if (ctl) return // already running
  const mine = (ctl = new AbortController())
  try {
    await run(m.config, mine.signal)
    post({ type: 'done', stopped: mine.signal.aborted })
  } catch (e) {
    post(e instanceof EngineError
      ? { type: 'error', code: e.code, dir: e.dir, status: e.status }
      : { type: 'error', code: 'unknown', detail: e instanceof Error ? e.message : String(e) })
    post({ type: 'done', stopped: true })
  } finally {
    ctl = null
  }
}
