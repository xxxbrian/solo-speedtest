<script lang="ts">
  import { LIMITS, toSearch, type Config, type Phase } from '../engine/config'
  import { i18n } from '../i18n/index.svelte'
  import Stepper from './Stepper.svelte'

  let { cfg, locked, patch, reset }: {
    cfg: Config; locked: boolean
    patch: (fn: (c: Config) => void) => void; reset: () => void
  } = $props()

  const t = $derived(i18n.t)
  const link = $derived(location.origin + location.pathname + toSearch(cfg))
  let copied = $state(false)
  async function copy() {
    await navigator.clipboard?.writeText(link).catch(() => {})
    copied = true
    setTimeout(() => (copied = false), 1500)
  }
  const toggle = (p: Phase) =>
    patch((c) => {
      const on = !c.test.includes(p)
      c.test = (['ping', 'down', 'up'] as const).filter((x) => (x === p ? on : c.test.includes(x)))
    })
</script>

<section class="settings">
  <div class="group wide">
    <h3>{t.settings.tests}</h3>
    <div class="chips">
      {#each ['ping', 'down', 'up'] as const as p}
        <button type="button" class="chip" class:on={cfg.test.includes(p)} disabled={locked}
          aria-pressed={cfg.test.includes(p)} onclick={() => toggle(p)}>{t.phase[p]}</button>
      {/each}
    </div>
    <label class="switch">
      <input type="checkbox" checked={cfg.auto} onchange={(e) => patch((c) => (c.auto = e.currentTarget.checked))} />
      <span>{t.settings.auto}</span>
    </label>
  </div>

  <div class="group">
    <h3>{t.settings.download}</h3>
    <Stepper label={t.settings.duration} suffix={t.unit.sec} value={cfg.dur.down} min={LIMITS.dur[0]} max={LIMITS.dur[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.dur.down = v))} />
    <Stepper label={t.settings.conns} value={cfg.conn.down} min={LIMITS.conn[0]} max={LIMITS.conn[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.conn.down = v))} />
  </div>

  <div class="group">
    <h3>{t.settings.upload}</h3>
    <Stepper label={t.settings.duration} suffix={t.unit.sec} value={cfg.dur.up} min={LIMITS.dur[0]} max={LIMITS.dur[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.dur.up = v))} />
    <Stepper label={t.settings.conns} value={cfg.conn.up} min={LIMITS.conn[0]} max={LIMITS.conn[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.conn.up = v))} />
  </div>

  <div class="group wide cols">
    <h3>{t.settings.general}</h3>
    <Stepper label={t.settings.warmup} hint={t.settings.warmupHint} suffix={t.unit.sec} value={cfg.warmup} min={LIMITS.warmup[0]} max={LIMITS.warmup[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.warmup = v))} />
    <Stepper label={t.settings.pings} suffix={t.unit.count} value={cfg.pings} min={LIMITS.pings[0]} max={LIMITS.pings[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.pings = v))} />
    <Stepper label={t.settings.rounds} hint={t.settings.roundsHint} value={cfg.rounds} min={LIMITS.rounds[0]} max={LIMITS.rounds[1]} disabled={locked}
      onchange={(v) => patch((c) => (c.rounds = v))} />
    <Stepper label={t.settings.gap} suffix={t.unit.sec} value={cfg.gap} min={LIMITS.gap[0]} max={LIMITS.gap[1]} disabled={locked || cfg.rounds === 1}
      onchange={(v) => patch((c) => (c.gap = v))} />
  </div>

  <div class="group wide">
    <h3>{t.settings.share}</h3>
    <div class="linkrow">
      <code>{link}</code>
      <button type="button" class="ghost" onclick={copy}>{copied ? t.settings.copied : t.settings.copy}</button>
    </div>
    <div class="foot">
      {#if locked}<span class="hint">{t.settings.locked}</span>{:else}<span></span>{/if}
      <button type="button" class="ghost" disabled={locked} onclick={reset}>{t.settings.reset}</button>
    </div>
  </div>
</section>
