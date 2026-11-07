# solo-speedtest

[简体中文](README.zh-CN.md)

A small self-hosted speed test with a web UI, runnable as a single container on a single port.
Hono + Bun serves the built Svelte 5 static page and three endpoints that only send and receive bytes (`/api/download`, `/api/upload`, `/api/ping`).

## Run

```sh
bun install
bun run build
PORT=3210 bun start          # locally

docker build -t solo-speedtest .
docker run -p 3000:3000 solo-speedtest
```

## URL parameters

Non-canonical URLs get a 302 to the canonical form (fixed key order, defaults omitted, case-insensitive).

| Parameter | Meaning |
|---|---|
| `auto=1` | Start automatically when the page opens |
| `test=ping,down,up` | Which tests to run, and in what order |
| `dur` / `down.dur` / `up.dur` | Measurement seconds per direction |
| `conn` / `down.conn` / `up.conn` | Concurrent connections |
| `warmup` | Warm-up seconds (not counted) |
| `pings` | Number of latency samples |
| `rounds` | Number of rounds, 0 = unlimited |
| `gap` | Seconds between rounds |

Example: `/?auto=1&dur=8&down.conn=6&rounds=0&gap=30`

## Deployment notes

If there is a reverse proxy or CDN in front, turn off compression and buffering and lift the request body size limit, otherwise you measure the proxy.
The UI language is stored only in the browser's localStorage, never in the URL.

## Development

`bun test`, `bun run check` (svelte-check). Restart the server after rebuilding `dist`.
