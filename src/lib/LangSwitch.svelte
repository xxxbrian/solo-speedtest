<script lang="ts">
  import { i18n } from '../i18n/index.svelte'
  import { LANG_NAMES, type Lang } from '../i18n/detect'
  const opts = $derived<[Lang | null, string][]>([[null, i18n.t.lang.auto], ['en', LANG_NAMES.en], ['zh', LANG_NAMES.zh]])
</script>

<div class="seg" role="group" aria-label={i18n.t.aria.lang}>
  {#each opts as [v, label] (v)}
    <button type="button" aria-pressed={i18n.pref === v} onclick={() => i18n.set(v)}>{label}</button>
  {/each}
</div>
