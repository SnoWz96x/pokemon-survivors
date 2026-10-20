#!/usr/bin/env node
/**
 * The co-op chaos soak: rooms of bot players running the real client (`src/coop`, bundled once,
 * each bot in a worker thread) against a local `wrangler dev` relay (the same Durable Object and
 * SQLite runtime as Cloudflare), every bot through its own chaos proxy (`proxy.mjs`). Runs are
 * played to their natural end (the team wipes, or the victory's vote ends it) while the soak cuts
 * sockets, reopens bots as fresh tabs, hides tabs, forces desyncs, storms picks and restarts the
 * relay mid-run. Then it checks what stability means:
 *
 *   - every run reached its natural end and the relay confirmed it;
 *   - every client ended on the same tick with the same state hash;
 *   - every injected desync was healed;
 *   - nobody banked twice (deposits equal the payout, after banking every end twice);
 *   - nobody replayed from tick 0 once the run had a snapshot;
 *   - the outbox stayed bounded.
 *
 *   npm run soak                                   3 rooms (br, us, mixed) × 4 bots, chaos on
 *   npm run soak -- --rooms=1 --bots=2 --minutes=3 --profiles=br
 *   npm run soak -- --relay=https://ps-coop-dev.pedrobarretto.workers.dev --rooms=1 --minutes=2 --no-restart
 *   npm run soak -- --json=soak.json               numbers for the PR
 *   npm run soak -- --surrender=10                 the bots stop kiting at minute 10, so the horde ends the runs then
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { build, loadConfigFromFile } from 'vite'
import { PROFILES, startProxy } from './proxy.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'node_modules', '.cache', 'coop-soak')
const args = process.argv.slice(2)
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const flag = (name) => args.includes(`--${name}`)

const ROOMS = Number(opt('rooms', 3))
const BOTS = Number(opt('bots', 4))
const MINUTES = Number(opt('minutes', 26))
const PROFILE_SET = opt('profiles', 'br,us,mixed').split(',')
const RELAY_PORT = Number(opt('port', 8796))
const EXTERNAL = opt('relay', null)
const CHAOS = !flag('no-chaos')
const SURRENDER = opt('surrender', null) === null ? null : Number(opt('surrender', 0)) * 60_000
const RESTART_AT = flag('no-restart') || EXTERNAL ? null : Number(opt('restart-at', 7)) * 60_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a)
const pct = (a, p) => (a.length ? +[...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))].toFixed(2) : null)

/* ---------------- Build ---------------- */

const { config } = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(root, 'vite.config.ts'))
const SIM_BUILD = JSON.parse(config.define.__SIM_BUILD__)
await build({
  configFile: false,
  logLevel: 'warn',
  root,
  define: { __SIM_BUILD__: JSON.stringify(SIM_BUILD), __GAME_VERSION__: '"soak"' },
  build: { outDir, emptyOutDir: true, minify: false, target: 'es2022', lib: { entry: join(root, 'scripts/coop/entry.ts'), formats: ['es'], fileName: () => 'bot.js' } },
})
const bundle = pathToFileURL(join(outDir, 'bot.js')).href
log(`bundled the client, build ${SIM_BUILD}`)

/* ---------------- Relay ---------------- */

let relay = null
const relayUrl = EXTERNAL ?? `http://127.0.0.1:${RELAY_PORT}`
const startRelay = async () => {
  relay = spawn('npx', ['wrangler', 'dev', '--port', String(RELAY_PORT), '--ip', '127.0.0.1', '--log-level', 'warn'], { cwd: join(root, 'relay'), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  relay.stdout.on('data', () => {})
  relay.stderr.on('data', () => {})
  for (let i = 0; i < 120; i++) {
    await sleep(500)
    const ok = await fetch(`${relayUrl}/health`).then((r) => r.ok, () => false)
    if (ok) return
  }
  throw new Error('wrangler dev did not come up')
}
const stopRelay = async () => {
  if (!relay) return
  try {
    process.kill(-relay.pid, 'SIGKILL')
  } catch {}
  relay = null
  await sleep(300)
}
if (!EXTERNAL) {
  await startRelay()
  log(`relay up on :${RELAY_PORT}`)
}
const upstreamPort = EXTERNAL ? null : RELAY_PORT

/* ---------------- Bots ---------------- */

const spawnBot = (url, index, seed) => {
  const w = new Worker(join(root, 'scripts/coop/worker.mjs'), { workerData: { bundle, url, build: SIM_BUILD, index, seed } })
  let next = 0
  const waiting = new Map()
  const ready = new Promise((r) => w.once('message', r))
  w.on('message', (m) => {
    if (m.ready) return
    const p = waiting.get(m.id)
    waiting.delete(m.id)
    if (m.error) p?.reject(new Error(m.error))
    else p?.resolve(m.ok)
  })
  w.on('error', (e) => log(`bot ${index} crashed`, e))
  const call = async (cmd, extra = {}) => {
    await ready
    return new Promise((resolve, reject) => {
      const id = next++
      waiting.set(id, { resolve, reject })
      w.postMessage({ id, cmd, ...extra })
    })
  }
  return { index, call, worker: w }
}

const profileFor = (kind, i) => (kind === 'mixed' ? (i % 2 === 0 ? 'br' : 'us') : kind)

const rooms = []
for (let r = 0; r < ROOMS; r++) {
  const kind = PROFILE_SET[r % PROFILE_SET.length]
  const bots = []
  for (let i = 0; i < BOTS; i++) {
    const profile = profileFor(kind, i)
    const proxy = EXTERNAL ? null : startProxy({ port: 4200 + r * 10 + i, upstream: upstreamPort, profile: PROFILES[profile] })
    const url = proxy ? `http://127.0.0.1:${proxy.port}` : EXTERNAL
    bots.push({ ...spawnBot(url, i, 1000 * (r + 1) + i * 17), proxy, profile })
  }
  rooms.push({ r, kind, bots, code: null, startedAt: 0, chaos: [] })
}

const startRoom = async (room) => {
  const host = room.bots[0]
  const created = await host.call('create')
  if (!created.ok) throw new Error(`create: ${JSON.stringify(created)}`)
  room.code = created.code
  for (const b of room.bots) {
    const j = await b.call('join', { code: room.code })
    if (!j.ok) throw new Error(`join: ${JSON.stringify(j)}`)
  }
  await sleep(800)
  for (const b of room.bots.slice(1)) await b.call('ready')
  await sleep(800)
  await host.call('start')
  room.startedAt = Date.now()
  log(`room ${room.r} ${room.code} (${room.kind}) started`)
}
await Promise.all(rooms.map(startRoom))

/* ---------------- Chaos ---------------- */

/** Each room's trouble, at seconds into its run: [s, what, bot, extra]. */
const plan = [
  [45, 'cut', 1],
  [100, 'desync', 2],
  [150, 'fresh', 3],
  [200, 'hide', 1, { ms: 20_000 }],
  [260, 'storm', 0, { n: 400 }],
  [330, 'cut', 0],
  [400, 'fresh', 1],
  [520, 'desync', 0],
  [600, 'hide', 2, { ms: 45_000 }],
  [700, 'cut', 3],
  [760, 'storm', 3, { n: 400 }],
  [840, 'fresh', 2],
  [900, 'desync', 3],
  [1000, 'cut', 2],
]

const runChaos = async (room) => {
  for (const [at, what, i, extra = {}] of plan) {
    const b = room.bots[i % room.bots.length]
    const wait = room.startedAt + at * 1000 - Date.now()
    if (wait > 0) await sleep(wait)
    if (room.done) return
    room.chaos.push({ at, what, bot: b.index })
    log(`room ${room.r}: ${what} bot ${b.index}`)
    if (what === 'cut' && b.proxy) b.proxy.cut()
    else if (what === 'cut') await b.call('drop')
    else await b.call(what, extra)
  }
}
if (CHAOS) for (const room of rooms) void runChaos(room)

if (SURRENDER !== null) {
  for (const room of rooms) {
    void (async () => {
      await sleep(room.startedAt + SURRENDER - Date.now())
      if (room.done) return
      log(`room ${room.r}: the bots stop kiting`)
      for (const b of room.bots) await b.call('surrender')
    })()
  }
}

let restarts = 0
if (RESTART_AT !== null) {
  void (async () => {
    await sleep(RESTART_AT)
    if (rooms.every((r) => r.done)) return
    log('restarting the relay (a deploy, a crash)')
    await stopRelay()
    await startRelay()
    restarts++
    log('relay back')
  })()
}

/* ---------------- Watch ---------------- */

const deadline = Date.now() + MINUTES * 60_000
while (Date.now() < deadline) {
  await sleep(10_000)
  for (const room of rooms) {
    if (room.done) continue
    const reps = await Promise.all(room.bots.map((b) => b.call('report')))
    const ended = reps.every((x) => x.run?.ended || x.status.kind === 'closed')
    const line = reps.map((x) => `${x.index}:${x.run ? `${x.run.next}/${x.run.known} h${x.run.hold} ${x.run.phase}${x.run.syncing ? ' sync' : ''}` : x.status.kind} rtt${x.rtt}`).join(' | ')
    log(`room ${room.r} ${line}`)
    if (ended) {
      room.done = true
      // Bank every end again, as a reload would: nothing more may come of it.
      for (const b of room.bots) await b.call('bank')
      log(`room ${room.r} ended`)
    }
  }
  if (rooms.every((r) => r.done)) break
}

/* ---------------- Checks ---------------- */

const results = []
const checks = []
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail })
for (const room of rooms) {
  const reps = await Promise.all(room.bots.map((b) => b.call('stop')))
  for (const b of room.bots) b.proxy?.close()
  const tag = `room ${room.r} (${room.kind})`
  check(`${tag}: the run reached its natural end, confirmed by the relay`, reps.every((x) => x.run?.ended), reps.map((x) => x.run?.phase).join(','))
  const overs = new Set(reps.map((x) => (x.run?.over ? `${x.run.over.tick}:${x.run.over.h}` : 'none')))
  check(`${tag}: every client ended on the same tick and state hash`, overs.size === 1 && !overs.has('none'), [...overs].join(' '))
  const desyncs = reps.reduce((n, x) => n + x.log.desyncs, 0)
  const heals = reps.reduce((n, x) => n + x.log.events.filter((e) => e.what === 'healed').length, 0)
  check(`${tag}: every injected desync healed`, heals >= desyncs, `${desyncs} injected, ${heals} healed`)
  for (const x of reps) {
    check(`${tag} bot ${x.index}: banked exactly once`, x.pay && x.log.deposited === x.pay.coins + x.pay.bonus, `deposited ${x.log.deposited}, payout ${x.pay && x.pay.coins + x.pay.bonus}, ${x.log.bankCalls} bank calls`)
    const replays = x.log.events.filter((e) => e.what === 'sync' && e.reason !== 'resume' && e.from === 0 && e.to > 1300)
    check(`${tag} bot ${x.index}: never replayed from tick 0 after the first snapshot`, replays.length === 0, JSON.stringify(replays))
    check(`${tag} bot ${x.index}: outbox bounded`, x.outbox.maxQueued <= 20, `max ${x.outbox.maxQueued}`)
  }
  const syncs = reps.flatMap((x) => x.log.events.filter((e) => e.what === 'sync'))
  const frame = reps.flatMap((x) => x.frameMs)
  results.push({
    room: room.r,
    code: room.code,
    profile: room.kind,
    minutes: +((Date.now() - room.startedAt) / 60_000).toFixed(1),
    ticks: Math.max(...reps.map((x) => x.run?.next ?? 0)),
    gameTime: Math.max(...reps.map((x) => x.run?.time ?? 0)),
    phase: reps[0]?.run?.phase,
    level: reps[0]?.run?.level,
    chaos: room.chaos.length,
    desyncs,
    heals,
    healMs: reps.flatMap((x) => x.log.events.filter((e) => e.what === 'healed').map((e) => e.ms)),
    syncs: syncs.map((e) => `${e.reason}:${e.base === null ? 'own' : 'snap'}@${e.from}+${e.to - e.from}`),
    reconnects: reps.map((x) => x.reconnects),
    rtt: reps.map((x) => x.rtt),
    hold: reps.map((x) => x.run?.hold),
    jitterMs: reps.map((x) => x.run?.jitter),
    underruns: reps.map((x) => x.run?.stats.underruns),
    resent: reps.map((x) => x.outbox.resent),
    maxQueued: Math.max(...reps.map((x) => x.outbox.maxQueued)),
    snapshots: reps.flatMap((x) => x.run?.stats.snapshots ?? []).length,
    snapshotKB: pct(reps.flatMap((x) => (x.run?.stats.snapshots ?? []).map((s) => s.bytes / 1024)), 50),
    snapshotTakeMs: pct(reps.flatMap((x) => (x.run?.stats.snapshots ?? []).map((s) => s.takeMs)), 95),
    tickMs: reps.map((x) => x.run?.tickMs),
    frameMs: { p50: pct(frame, 50), p99: pct(frame, 99), max: pct(frame, 100) },
    deposited: reps.map((x) => x.log.deposited),
  })
}
await stopRelay()
const out = { build: SIM_BUILD, relay: EXTERNAL ?? 'wrangler dev', restarts, results, checks }
console.log(JSON.stringify(out, null, 1))
const json = opt('json', null)
if (json) {
  mkdirSync(dirname(resolve(root, json)), { recursive: true })
  writeFileSync(resolve(root, json), JSON.stringify(out, null, 1))
}
const failed = checks.filter((c) => !c.ok)
for (const c of failed) log(`FAIL ${c.name}: ${c.detail}`)
log(failed.length === 0 ? `all ${checks.length} checks passed` : `${failed.length} of ${checks.length} checks failed`)
process.exit(failed.length === 0 ? 0 : 1)
