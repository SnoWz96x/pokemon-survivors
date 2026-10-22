import { monitorEventLoopDelay } from 'node:perf_hooks'
import { configFrom } from './config'
import { jsonLog, startRelay } from './server'

/**
 * The São Paulo relay's process (systemd's `ps-relay` service on the
 * instance). SIGTERM (a deploy, `systemctl restart`) stops it gracefully:
 * players are told to reconnect at once and resume, and systemd starts the
 * new bundle. An uncaught error ends the process and systemd restarts it;
 * either way the rooms come back from disk.
 */

/** How often a `relay.stats` line goes to the logs. */
const STATS_MS = 60_000

const relay = await startRelay(configFrom(process.env))

// The event loop's lateness is the frame timers' lateness: the number to watch on a small instance.
const loop = monitorEventLoopDelay({ resolution: 5 })
loop.enable()
let cpu = process.cpuUsage()
const stats = setInterval(() => {
  const used = process.cpuUsage(cpu)
  cpu = process.cpuUsage()
  jsonLog('relay.stats', {
    ...relay.counts(),
    loopP50Ms: +(loop.percentile(50) / 1e6).toFixed(2),
    loopP99Ms: +(loop.percentile(99) / 1e6).toFixed(2),
    loopMaxMs: +(loop.max / 1e6).toFixed(2),
    cpuPct: +(((used.user + used.system) / 1000 / STATS_MS) * 100).toFixed(1),
    rssMb: Math.round(process.memoryUsage().rss / 1e6),
  })
  loop.reset()
}, STATS_MS)

let stopping = false
const stop = (signal: string) => {
  if (stopping) return
  stopping = true
  jsonLog('relay.stopping', { signal })
  clearInterval(stats)
  void relay.close().finally(() => process.exit(0))
}
process.on('SIGTERM', () => stop('SIGTERM'))
process.on('SIGINT', () => stop('SIGINT'))
process.on('uncaughtException', (err) => {
  jsonLog('relay.crash', { error: err.stack ?? err.message })
  process.exit(1)
})
