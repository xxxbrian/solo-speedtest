<script lang="ts">
  import { i18n } from '../i18n/index.svelte'
  let { label, hint = '', value, min, max, suffix = '', disabled = false, onchange }: {
    label: string; hint?: string; value: number; min: number; max: number
    suffix?: string; disabled?: boolean; onchange: (v: number) => void
  } = $props()
  const set = (v: number) => onchange(Math.min(max, Math.max(min, Math.round(v))))
</script>

<div class="stepper" class:disabled>
  <div class="lbl">{label}{#if hint}<small>{hint}</small>{/if}</div>
  <div class="ctl">
    <button type="button" aria-label={i18n.t.aria.dec} {disabled} onclick={() => set(value - 1)}>−</button>
    <input type="number" {min} {max} {disabled} {value}
      onchange={(e) => { set(e.currentTarget.valueAsNumber); e.currentTarget.value = String(value) }} />
    {#if suffix}<span class="suf">{suffix}</span>{/if}
    <button type="button" aria-label={i18n.t.aria.inc} {disabled} onclick={() => set(value + 1)}>+</button>
  </div>
</div>
