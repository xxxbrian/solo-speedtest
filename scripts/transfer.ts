export {}
// Transfer size of a first visit / revisit in real Chrome (Resource Timing). Usage: bun scripts/transfer.ts http://localhost:3210/
const url = process.argv[2] ?? 'http://localhost:3210/'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = `/tmp/transfer-prof-${Date.now()}`
const proc = Bun.spawn([chrome, '--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
try {
  let targets: any[] = []
  for (let i = 0; i < 50 && !targets.length; i++) { await Bun.sleep(200); targets = await fetch('http://127.0.0.1:9335/json').then((r) => r.json()).catch(() => []) }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0; const pending = new Map<number, (v: any) => void>()
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m) }
  const send = (method: string, params: any = {}) => new Promise<any>((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (js: string) => (await send('Runtime.evaluate', { expression: js, returnByValue: true })).result.result.value
  const read = `JSON.stringify(performance.getEntriesByType('resource').filter(r=>!r.name.includes('/api/')).map(r=>[new URL(r.name).pathname,r.transferSize,r.decodedBodySize,r.encodedBodySize]))`
  const show = (label: string, rows: [string, number, number, number][]) => {
    console.log(`\n${label}`)
    let t = 0
    for (const [p, transfer, decoded] of rows) { console.log(`  ${String(transfer).padStart(6)} B transferred / ${String(decoded).padStart(6)} B decoded  ${p}`); t += transfer }
    console.log(`  total transferred ${t} B`)
  }
  await send('Page.navigate', { url }); await Bun.sleep(1500)
  const html = JSON.parse(await ev(`JSON.stringify(performance.getEntriesByType('navigation').map(n=>[n.name,n.transferSize,n.decodedBodySize,n.encodedBodySize]))`))
  show('First visit', [...html.map((r: any) => ['(html)', r[1], r[2], r[3]]), ...JSON.parse(await ev(read))])
  await send('Page.navigate', { url }); await Bun.sleep(1500)
  const html2 = JSON.parse(await ev(`JSON.stringify(performance.getEntriesByType('navigation').map(n=>[n.name,n.transferSize,n.decodedBodySize,n.encodedBodySize]))`))
  show('Revisit (normal navigation)', [...html2.map((r: any) => ['(html)', r[1], r[2], r[3]]), ...JSON.parse(await ev(read))])
  console.log('\n(0 B transferred = served from the local cache; ~300 B for html means a 304 revalidation)')
} finally { proc.kill() }
