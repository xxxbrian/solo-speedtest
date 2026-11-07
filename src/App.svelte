<script lang="ts">
  import { onMount } from 'svelte'
  import { Engine } from './engine/client'
  import { DEFAULTS, normalize, parseSearch, toSearch, type Config, type Phase } from './engine/config'
  import type { FromWorker, PingResult, Stage } from './engine/types'
  import Chart from './lib/Chart.svelte'
  import Settings from './lib/Settings.svelte'
  import LangSwitch from './lib/LangSwitch.svelte'
  import { i18n } from './i18n/index.svelte'

  // ---- Config: settings and URL share normalize
  const initial = parseSearch(location.search)
  let cfg = $state<Config>(initial)
  history.replaceState(null, '', location.pathname + toSearch(initial)) // fallback: canonicalize the address bar even when no server redirect happened (e.g. vite dev)
  const apply = (next: Config) => {
    cfg = normalize(next)
    history.replaceState(null, '', location.pathname + toSearch(cfg))
  }
  const patch = (fn: (c: Config) => void) => { const c = structuredClone($state.snapshot(cfg)); fn(c); apply(c) }
  const reset = () => apply(structuredClone(DEFAULTS))

  // ---- Run state
  interface Round { round: number; ping?: PingResult; down?: number; up?: number }
  let running = $state(false)
  let finished = $state(false)
  let stage = $state<Stage>('idle')
  let phase = $state<Phase | null>(null)
  let round = $state(0)
  let progress = $state(0)
  let live = $state(0)
  let secondsLeft = $state(0)
  let error = $state<Extract<FromWorker, { type: 'error' }> | null>(null)
  let rounds = $state<Round[]>([])
  let series = $state<[number, number][]>([])
  let showSettings = $state(false)

  const PHASE = {
    ping: { unit: 'ms', color: 'var(--ping)' },
    down: { unit: 'Mbps', color: 'var(--down)' },
    up: { unit: 'Mbps', color: 'var(--up)' },
  } as const
  const t = $derived(i18n.t)
  $effect(() => { document.documentElement.lang = i18n.lang === 'zh' ? 'zh-Hans' : 'en' })
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2))

  let engine: Engine
  function onMsg(m: FromWorker) {
    if (m.type === 'state') {
      if (m.phase !== phase || m.round !== round) series = []
      stage = m.stage; phase = m.phase; round = m.round
      progress = m.progress; live = m.live; secondsLeft = m.secondsLeft ?? 0
      if (m.phase && m.stage !== 'gap') series = [...series, [m.progress, m.live]]
    } else if (m.type === 'result') {
      if (!rounds.some((x) => x.round === m.round)) rounds = [...rounds, { round: m.round }]
      const cur = rounds.find((x) => x.round === m.round)!
      if (m.phase === 'ping') cur.ping = m.ping
      else cur[m.phase] = m.mbps
    } else if (m.type === 'error') {
      error = m
    } else if (m.type === 'done') {
      running = false; stage = 'idle'; phase = null; finished = !m.stopped && error == null
    }
  }
  function start() {
    if (running || !cfg.test.length) return
    error = null; rounds = []; series = []; finished = false; running = true; round = 1; phase = null; progress = 0
    engine.start($state.snapshot(cfg) as Config)
  }
  const stop = () => engine.stop()
  const toggle = () => (running ? stop() : start())

  onMount(() => {
    engine = new Engine(onMsg)
    if (cfg.auto) start()
  })

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    if (e.code !== 'Space' || t.closest('input, button, summary, a')) return
    e.preventDefault(); toggle()
  }

  // ---- Derived display
  const latest = $derived(rounds[rounds.length - 1])
  const heroPhase = $derived<Phase | null>(
    running && phase ? phase : null,
  )
  const heroValue = $derived(
    heroPhase ? live
    : finished || (!running && latest) ? (latest?.down ?? null)
    : null,
  )
  const heroUnit = $derived(heroPhase ? PHASE[heroPhase].unit : 'Mbps')
  const heroLabel = $derived(
    stage === 'gap' ? t.status.gap(secondsLeft)
    : heroPhase ? (stage === 'warmup' ? t.status.warmup : t.status.measure)(t.phase[heroPhase])
    : finished ? t.status.done
    : latest ? t.status.stopped : t.status.ready,
  )
  const heroColor = $derived(heroPhase ? PHASE[heroPhase].color : 'var(--down)')
  const steps = $derived(cfg.test)
  const errorText = $derived(
    !error ? ''
    : error.code === 'unknown' ? error.detail
    : error.code === 'http' ? t.err.http(t.phase[error.dir], error.status ?? 0)
    : t.err.network(t.phase[error.dir]),
  )
  const stepState = (p: Phase) =>
    running && p === phase ? 'active' : latest?.[p] != null ? 'done' : ''
</script>

<svelte:window onkeydown={onKey} />

<main>
  <header>
    <h1>Speedtest</h1>
    <div class="head-right">
    <LangSwitch />
    <button class="ghost icon" aria-expanded={showSettings} onclick={() => (showSettings = !showSettings)}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
      {t.settings.title}
    </button>
    </div>
  </header>

  <section class="hero" class:live={!!heroPhase} style:--c={heroColor} aria-live="off">
    <div class="status">
      {heroLabel}
      {#if running && cfg.rounds !== 1}<em>{t.round(round, cfg.rounds)}</em>{/if}
    </div>
    <div class="big">
      <span class="num">{heroValue == null ? '—' : fmt(heroValue)}</span>
      <span class="unit">{heroValue == null && !heroPhase ? 'Mbps' : heroUnit}</span>
    </div>
    <Chart points={heroPhase ? series : []} color={heroColor} />
    <div class="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin="0" aria-valuemax="100">
      <i style:width="{(heroPhase ? progress : finished ? 1 : 0) * 100}%"></i>
    </div>
  </section>

  <section class="tiles">
    {#each steps as p (p)}
      {@const r = latest}
      <div class="tile {stepState(p)}" style:--c={PHASE[p].color}>
        <div class="k">{t.phase[p]}</div>
        <div class="v">
          {#if p === 'ping'}{r?.ping ? fmt(r.ping.median) : '—'}{:else}{r?.[p] != null ? fmt(r[p]!) : '—'}{/if}
          <small>{PHASE[p].unit}</small>
        </div>
        <div class="s">
          {#if p === 'ping' && r?.ping}{t.tile.jitterLoss(fmt(r.ping.jitter), (r.ping.loss * 100).toFixed(0))}
          {:else if p !== 'ping' && stepState(p) === 'active'}{t.tile.conns(cfg.conn[p])}{/if}
        </div>
      </div>
    {/each}
  </section>

  <div class="actions">
    <button class="primary" class:stop={running} disabled={!running && !cfg.test.length} onclick={toggle}>
      {running ? t.action.stop : finished || latest ? t.action.again : t.action.start}
    </button>
    <span class="kbd">{running ? t.hint.stop : t.hint.start}</span>
  </div>
  {#if !cfg.test.length}<p class="msg">{t.noPhase}</p>{/if}
  {#if error}<p class="msg err" role="alert">{t.error(errorText)}</p>{/if}

  {#if rounds.length > 1}
    <section class="history">
      <h2>{t.history.title}</h2>
      <table>
        <thead><tr><th>#</th>{#if cfg.test.includes('ping')}<th>{t.phase.ping} ms</th>{/if}{#if cfg.test.includes('down')}<th>{t.phase.down} Mbps</th>{/if}{#if cfg.test.includes('up')}<th>{t.phase.up} Mbps</th>{/if}</tr></thead>
        <tbody>
          {#each [...rounds].reverse() as r (r.round)}
            <tr>
              <td>{r.round}</td>
              {#if cfg.test.includes('ping')}<td>{r.ping ? fmt(r.ping.median) : '—'}</td>{/if}
              {#if cfg.test.includes('down')}<td>{r.down != null ? fmt(r.down) : '—'}</td>{/if}
              {#if cfg.test.includes('up')}<td>{r.up != null ? fmt(r.up) : '—'}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if showSettings}
    <Settings {cfg} locked={running} {patch} {reset} />
  {/if}
</main>
