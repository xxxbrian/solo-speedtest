import type { Config } from './config'
import type { FromWorker } from './types'

/** Thin main-thread wrapper: all measurement logic lives in the Worker, this only forwards messages. */
export class Engine {
  private w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  constructor(onMsg: (m: FromWorker) => void) {
    this.w.onmessage = (e: MessageEvent<FromWorker>) => onMsg(e.data)
  }
  start(config: Config) { this.w.postMessage({ type: 'start', config }) }
  stop() { this.w.postMessage({ type: 'stop' }) }
}
