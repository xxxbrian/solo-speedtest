export {}
// Real-browser end-to-end: drives headless Chrome over CDP, waits for the test to finish in real time and reads the UI.
// Usage: bun scripts/e2e.ts "http://localhost:3000/?auto=1&dur=4"
const url = process.argv[2] ?? 'http://localhost:3000/?auto=1&dur=4&warmup=1&pings=8'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const proc = Bun.spawn([chrome, '--headless=new', '--remote-debugging-port=9333', '--user-data-dir=/tmp/e2e-prof',
  '--no-first-run', ...(process.env.L ? [`--lang=${process.env.L}`, `--accept-lang=${process.env.L}`] : []), 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
try {
  let targets: any[] = []
  for (let i = 0; i < 50 && !targets.length; i++) {
    await Bun.sleep(200)
    targets = await fetch('http://127.0.0.1:9333/json').then((r) => r.json()).catch(() => [])
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map<number, (v: any) => void>()
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m); }
  const send = (method: string, params: any = {}) =>
    new Promise<any>((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })) })
  const evalJs = async (expr: string) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value
  await send('Page.navigate', { url })
  const read = `JSON.stringify({hero:document.querySelector('.num')?.textContent,
    vals:[...document.querySelectorAll('.tile .v')].map(e=>e.textContent.trim()),
    status:document.querySelector('.status')?.textContent.trim(), err:document.querySelector('.err')?.textContent,
    rows:[...document.querySelectorAll('tbody tr')].map(r=>r.textContent.trim().replace(/\\s+/g,' ')), running:!!document.querySelector('button.primary.stop')})`
  // L=zh-CN sets the browser language; SHOT=/path/prefix takes screenshots at 3s and at the end; W=width emulates a narrow screen
  const shot = async (name: string) => {
    if (!process.env.SHOT) return
    const r = await send('Page.captureScreenshot', { format: 'png' })
    await Bun.write(`${process.env.SHOT}-${name}.png`, Buffer.from(r.result.data, 'base64'))
  }
  if (process.env.W) await send('Emulation.setDeviceMetricsOverride', { width: +process.env.W, height: 900, deviceScaleFactor: 2, mobile: false })
  const t0 = Date.now()
  if (process.env.OPEN) { await Bun.sleep(1500); await evalJs(`document.querySelector('.head-right > button').click()`); await Bun.sleep(300); if (process.env.FOCUS) { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await evalJs(`document.querySelector('.stepper input').focus()`); await Bun.sleep(200) } await shot('settings'); proc.kill(); process.exit(0) }
  let last = ''
  while (Date.now() - t0 < 120000) {
    await Bun.sleep(1000)
    last = await evalJs(read)
    const s = last ? JSON.parse(last) : null
    if (s) console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(3) + 's', last)
    if (Date.now() - t0 > 3000 && Date.now() - t0 < 4100) await shot('mid')
    if (s && !s.running && s.vals.length && s.vals.every((v: string) => !v.startsWith('—')) && Date.now() - t0 > 3000) { await shot('end'); break }
    if (s?.err) break
  }
} finally { proc.kill() }
