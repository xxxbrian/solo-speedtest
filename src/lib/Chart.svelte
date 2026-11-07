<script lang="ts">
  // Live chart refreshed at low frequency (~4 Hz, few points): plain SVG paths, no chart library
  let { points, color }: { points: [number, number][]; color: string } = $props()
  const W = 300, H = 90
  const path = $derived.by(() => {
    if (points.length < 2) return { line: '', area: '' }
    const max = Math.max(...points.map((p) => p[1])) * 1.15 || 1
    const xy = points.map(([x, v]) => `${(x * W).toFixed(1)},${(H - (v / max) * H).toFixed(1)}`)
    const line = 'M' + xy.join('L')
    const last = points[points.length - 1][0] * W
    return { line, area: `${line}L${last.toFixed(1)},${H}L0,${H}Z` }
  })
</script>

<svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true" style:--c={color}>
  <line x1="0" x2={W} y1={H * 0.5} y2={H * 0.5} class="grid" />
  <path d={path.area} class="area" />
  <path d={path.line} class="line" />
</svg>
