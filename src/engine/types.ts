import type { Config, Phase } from './config'

export type ToWorker = { type: 'start'; config: Config } | { type: 'stop' }

export type Stage = 'idle' | 'warmup' | 'measure' | 'gap'

export interface PingResult { median: number; min: number; jitter: number; loss: number }

export type FromWorker =
  | {
      type: 'state' // low-frequency progress (~4 Hz)
      stage: Stage
      phase: Phase | null
      round: number
      progress: number // 0..1, current phase
      live: number // download/upload: Mbps over the last second; latency: current RTT in ms
      secondsLeft?: number // gap countdown
    }
  | { type: 'result'; round: number; phase: 'down' | 'up'; mbps: number; bytes: number; confirmed?: number }
  | { type: 'result'; round: number; phase: 'ping'; ping: PingResult }
  | { type: 'done'; stopped: boolean }
  | { type: 'error'; code: 'http' | 'network'; dir: 'down' | 'up'; status?: number }
  | { type: 'error'; code: 'unknown'; detail: string }
