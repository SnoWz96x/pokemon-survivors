// One soak bot in a worker thread: the real co-op client (bundled), driven at ~60 Hz, taking
// chaos commands from `soak.mjs` and reporting what it saw.
import { parentPort, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'

const B = await import(workerData.bundle)
const { url, build, index, seed } = workerData
const data = new Map()
const store = { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k), keys: () => [...data.keys()] }
const deps = {
  url,
  build,
  socket: B.webSocket,
  fetch: (u, init) => fetch(u, init),
  store,
  token: async () => null,
  name: () => `Bot ${index}`,
  now: () => performance.now(),
  random: Math.random,
}
const bot = B.createBot(deps, { seed, vote: false })
const c = bot.client
const log = { deposited: 0, bankCalls: 0, banks: [], events: [], frameMs: [], hiddenUntil: 0, desyncs: 0, storms: 0 }
const note = (what, extra = {}) => log.events.push({ at: Math.round(performance.now()), what, ...extra })
c.on((e) => {
  if (e.kind === 'healed') note('healed', { tick: e.tick, ms: Math.round(e.ms) })
  if (e.kind === 'ended') note('ended', { tick: e.tick })
  if (e.kind === 'status' && e.status.kind === 'closed') note('closed', { why: e.status.why })
  if (e.kind === 'run') note('run', { why: e.why })
  if (e.kind === 'sync') note('sync', { reason: e.reason, from: e.from, to: e.to, base: e.base })
})

/** Banks the run's payout delta (the shell's banking, minus the wallet): called on every end it sees, twice even. */
const bankNow = () => {
  const r = c.state().runner
  if (!r) return
  const g = r.game
  const won = g.phase === 'victory'
  if (!won && !B.coopOver(g)) return
  log.bankCalls++
  B.bank(store, B.bankKey(r.room, r.start.id), B.coopPayout(g, r.slot), true, (d) => (log.deposited += d.coins))
}

let last = performance.now()
let stopped = false
const loop = () => {
  if (stopped) return
  const now = performance.now()
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (log.hiddenUntil && now >= log.hiddenUntil) {
    log.hiddenUntil = 0
    c.setHidden(false)
    note('shown')
  }
  const t0 = performance.now()
  bot.frame(dt)
  const ms = performance.now() - t0
  if (log.frameMs.length < 200_000) log.frameMs.push(ms)
  const r = c.state().runner
  if (r && (B.coopOver(r.game) || r.game.phase === 'victory') && !log.bankedAt) {
    log.bankedAt = r.next
    bankNow()
    bankNow()
  }
  setTimeout(loop, Math.max(0, 16 - (performance.now() - now)))
}

const report = () => {
  const s = c.state()
  const r = s.runner
  return {
    index,
    seat: s.seat,
    status: s.status,
    code: s.code,
    run: r ? { id: r.start.id, next: r.next, known: r.known, hold: r.hold.hold, jitter: Math.round(r.hold.jitter), tickMs: +r.tickMs.toFixed(2), over: r.over, ended: r.ended, phase: r.game.phase, time: Math.round(r.game.time), level: B.localPlayer(r.game).level, stats: r.stats, syncing: !!r.syncing } : null,
    rtt: Math.round(s.rtt),
    reconnects: s.reconnects,
    outbox: s.outbox.stats,
    queued: c.queued(),
    log: { ...log, frameMs: undefined },
    pay: r ? (({ coins, bonus }) => ({ coins, bonus }))(B.coopPayout(r.game, r.slot)) : null,
    frameMs: log.frameMs,
  }
}

/** Trouble the soak stages only on a run still going: a desync after the end has nothing left to heal it. */
const live = () => {
  const r = c.state().runner
  return r && !r.over && !r.ended
}

parentPort.on('message', async (m) => {
  try {
    if (['drop', 'fresh', 'hide', 'desync', 'storm'].includes(m.cmd) && !live()) return parentPort.postMessage({ id: m.id, ok: 'skipped' })
    switch (m.cmd) {
      case 'create': {
        const res = await c.create(m.region ?? 'auto')
        parentPort.postMessage({ id: m.id, ok: res })
        return
      }
      case 'join': {
        const res = await c.join(m.code)
        c.setLoadout(B.botPick(index + seed))
        parentPort.postMessage({ id: m.id, ok: res.ok ? { ok: true, seat: res.seat } : res })
        if (!stopped) loop()
        return
      }
      case 'ready':
        c.setReady(true)
        break
      case 'start':
        c.start()
        break
      case 'drop':
        note('drop')
        c.drop()
        break
      case 'fresh':
        note('fresh')
        c.rejoinFresh()
        break
      case 'hide':
        note('hidden', { ms: m.ms })
        c.setHidden(true)
        log.hiddenUntil = performance.now() + m.ms
        break
      case 'desync': {
        const r = c.state().runner
        if (r) {
          r.game.coins += 13
          log.desyncs++
          note('desync', { tick: r.next })
        }
        break
      }
      case 'storm':
        log.storms++
        note('storm')
        bot.storm(m.n ?? 300)
        break
      case 'bank':
        bankNow()
        break
      case 'hash': {
        const r = c.state().runner
        parentPort.postMessage({ id: m.id, ok: r ? { tick: r.next, h: B.stateHash(r.game) } : null })
        return
      }
      case 'report':
        parentPort.postMessage({ id: m.id, ok: report() })
        return
      case 'stop':
        stopped = true
        parentPort.postMessage({ id: m.id, ok: report() })
        setTimeout(() => process.exit(0), 50)
        return
    }
    parentPort.postMessage({ id: m.id, ok: true })
  } catch (e) {
    parentPort.postMessage({ id: m.id, error: String(e?.stack ?? e) })
  }
})
parentPort.postMessage({ ready: true })
