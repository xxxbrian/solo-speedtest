# solo-speedtest

[English](README.md)

一个小型的自托管测速工具，带网页界面，单容器、单端口即可运行。
Hono + Bun 同时托管 Svelte 5 静态页面和三个端点（`/api/download`、`/api/upload`、`/api/ping`）。

## 运行

```sh
bun install
bun run build
PORT=3210 bun start          # 本地

docker build -t solo-speedtest .
docker run -p 3000:3000 solo-speedtest
```

## URL 参数

非规范的 URL 会 302 到规范形式（键顺序固定、省略默认值、大小写不敏感）。

| 参数 | 含义 |
|---|---|
| `auto=1` | 打开页面后自动开始 |
| `test=ping,down,up` | 要测的项目及顺序 |
| `dur` / `down.dur` / `up.dur` | 每个方向的测量秒数 |
| `conn` / `down.conn` / `up.conn` | 并发连接数 |
| `warmup` | 预热秒数（不计入结果） |
| `pings` | 延迟采样次数 |
| `rounds` | 循环次数，0 = 无限 |
| `gap` | 轮间隔秒数 |

示例：`/?auto=1&dur=8&down.conn=6&rounds=0&gap=30`

## 部署注意

前面如果有反向代理或 CDN，需关闭压缩和缓冲，并放开请求体大小限制，否则测到的是代理。
界面语言只存在浏览器 localStorage，不进 URL。

## 开发

`bun test`、`bun run check`（svelte-check）。`dist` 重新构建后需重启服务。
