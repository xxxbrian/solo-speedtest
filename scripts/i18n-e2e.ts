import { zh } from '../src/i18n/zh'
// Verifies language detection / switching / persistence in real Chrome. Usage: bun scripts/i18n-e2e.ts http://localhost:3210/
const base = process.argv[2] ?? 'http://localhost:3210/'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
let fails = 0
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
}

async function session(accept: string, steps: (ev: (js: string) => Promise<any>, nav: () => Promise<void>) => Promise<void>) {
  const dir = `/tmp/i18n-prof-${Math.random().toString(36).slice(2)}`
  const proc = Bun.spawn([chrome, '--headless=new', '--remote-debugging-port=9334', `--user-data-dir=${dir}`,
    '--no-first-run', `--lang=${accept.split(',')[0]}`, `--accept-lang=${accept}`, 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
  try {
    let targets: any[] = []
    for (let i = 0; i < 50 && !targets.length; i++) {
      await Bun.sleep(200)
      targets = await fetch('http://127.0.0.1:9334/json').then((r) => r.json()).catch(() => [])
    }
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let id = 0
    const pending = new Map<number, (v: any) => void>()
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m) }
    const send = (method: string, params: any = {}) =>
      new Promise<any>((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })) })
    const ev = async (js: string) => (await send('Runtime.evaluate', { expression: js, returnByValue: true })).result.result.value
    const nav = async () => { await send('Page.navigate', { url: base }); await Bun.sleep(1200) }
    await nav()
    await steps(ev, nav)
  } finally { proc.kill(); await Bun.sleep(500) }
}

const primary = `document.querySelector('button.primary')?.textContent.trim()`
const htmlLang = `document.documentElement.lang`
const stored = `localStorage.getItem('speedtest.lang')`
const click = (label: string) => `[...document.querySelectorAll('.seg button')].find(b=>b.textContent.trim()==='${label}').click()`

await session('zh-CN', async (ev, nav) => {
  check('zh-CN -> Chinese', await ev(primary), zh.action.start)
  check('zh-CN html lang', await ev(htmlLang), 'zh-Hans')
  await ev(click('EN')); await Bun.sleep(200)
  check('click EN -> English', await ev(primary), 'Start test')
  check('click EN -> stored', await ev(stored), 'en')
  check('click EN -> html lang', await ev(htmlLang), 'en')
  await nav()
  check('English persists after reload', await ev(primary), 'Start test')
  check('EN button is pressed', await ev(`document.querySelector('.seg button[aria-pressed=true]').textContent`), 'EN')
  await ev(click('Auto')); await Bun.sleep(200)
  check('click Auto -> storage cleared', await ev(stored), null)
  check('click Auto -> back to detected (Chinese)', await ev(primary), zh.action.start)
  check('URL has no lang', await ev(`location.search`), '')
})
await session('en-US', async (ev) => { check('en-US -> English', await ev(primary), 'Start test') })
await session('fr-FR', async (ev) => { check('fr-FR -> falls back to English', await ev(primary), 'Start test') })
await session('fr-FR,zh-TW,en', async (ev) => { check('fr,zh-TW,en -> Chinese (zh-TW comes before en)', await ev(primary), zh.action.start) })
await session('zh-CN', async (ev) => {
  await ev(`localStorage.setItem('speedtest.lang','garbage')`)
  await ev(`location.reload()`); await Bun.sleep(1200)
  check('invalid stored value -> treated as auto', await ev(primary), zh.action.start)
})
console.log(fails ? `\n${fails} failed` : '\nall passed')
process.exit(fails ? 1 : 0)
