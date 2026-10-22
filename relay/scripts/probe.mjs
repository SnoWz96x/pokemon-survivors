// Bots that speak the real protocol against a relay and measure it.
//
//   node scripts/probe.mjs [--url https://ps-coop-dev.pedrobarretto.workers.dev] [--bots 2] [--secs 60]
//                          [--region auto] [--hz 30] [--desync] [--rejoin] [--json out.json]
//
// The bots don't simulate: each "state hash" at tick t is `h<t>` (so they agree),
// the uploader sends a fake snapshot every 600 ticks, and every bot sends a stick
// input 30 times a second. `--desync` makes the last bot report a wrong hash once
// (it must be healed, and a dump recorded); `--rejoin` reconnects the last bot
// fresh halfway (it must get the agreed snapshot plus a tail). At the end all bots
// report `over` and the relay must end the run. A bot whose socket drops (a relay
// deploy or restart) reconnects with `resume` and records how long it was out.
// Prints RTT, frame inter-arrival, input-to-frame latency, reconnects and the checks.

import { performance } from 'node:perf_hooks'
import { writeFileSync } from 'node:fs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? fallback : (process.argv[i + 1] ?? true)
}
const flag = (name) => process.argv.includes(`--${name}`)
const URL_BASE = arg('url', 'https://ps-coop-dev.pedrobarretto.workers.dev')
const BOTS = Number(arg('bots', 2))
const SECS = Number(arg('secs', 60))
const REGION = arg('region', 'auto')
const HZ = Number(arg('hz', 30))
const FINAL_CODES = [4001, 4002, 4003, 4004, 4005, 4008]
const PROTOCOL = 2
const BUILD = 'probe'

const pct = (a, p) => (a.length ? +[...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))].toFixed(1) : null)
const stats = (a) => ({ n: a.length, p50: pct(a, 50), p95: pct(a, 95), p99: pct(a, 99), max: a.length ? +Math.max(...a).toFixed(1) : null })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const check = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail })

const res = await fetch(`${URL_BASE}/rooms`, { method: 'POST', body: JSON.stringify({ v: PROTOCOL, build: BUILD, region: REGION }) })
const created = await res.json()
if (!created.code) throw new Error(`create: ${JSON.stringify(created)}`)
const code = created.code
console.error(`room ${code} (${created.region})`)

const bot = (i) => {
  const b = { i, guest: `probe-${code}-${i}-${Math.random().toString(36).slice(2, 10)}`.padEnd(20, 'x'), secret: null, seat: null, inbox: [], at: 0, rtt: [], gaps: [], inLat: [], lastArr: null, sent: new Map(), heals: 0, syncs: [], roles: [], ended: null, closed: false, nextIn: 1, run: null, outs: [], downAt: null }
  b.connect = (resume) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${URL_BASE.replace(/^http/, 'ws')}/rooms/${code}/ws`)
      b.ws = ws
      b.syncing = false
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, build: BUILD, room: code, auth: { kind: 'guest', id: b.guest }, secret: b.secret, name: `Bot ${i}`, resume }))
      ws.onmessage = (e) => {
        const now = performance.now()
        const m = JSON.parse(e.data)
        b.inbox.push(m)
        if (m.t === 'welcome') {
          b.secret = m.secret
          b.seat = m.seat
          if (b.downAt !== null) b.outs.push({ welcomeMs: +(now - b.downAt).toFixed(0) })
          resolve()
        } else if (m.t === 'refused') resolve()
        else if (m.t === 'pong') b.rtt.push(now - m.at)
        else if (m.t === 'role') b.roles.push(m.snapshots)
        else if (m.t === 'heal') b.heals++
        else if (m.t === 'ended') b.ended = m
        else if (m.t === 'start') b.run = m.run.id
        else if (m.t === 'sync') {
          b.syncs.push(m)
          b.run = m.run.id
          const out = b.outs.at(-1)
          if (out && b.downAt !== null) Object.assign(out, { reason: m.reason, tail: m.to - m.from })
          b.at = m.from
          b.syncTo = m.to
          b.syncing = m.to > m.from
          b.lastArr = null
        } else if (m.t === 'frame') {
          if (m.from !== b.at) check(`bot ${i} frames contiguous`, false, `expected ${b.at}, got ${m.from}`)
          for (let t = Math.ceil(b.at / 60) * 60; t < m.to; t += 60) b.onTick(t)
          b.at = m.to
          if (b.syncing) {
            if (m.to >= b.syncTo) b.syncing = false
            return
          }
          if (b.downAt !== null) {
            const out = b.outs.at(-1)
            if (out) out.liveFrameMs = +(now - b.downAt).toFixed(0)
            b.downAt = null
          }
          if (b.lastArr !== null) b.gaps.push(now - b.lastArr)
          b.lastArr = now
          for (const [, entries] of m.ticks) for (const en of entries) if (en[0] === b.seat && en[1] === 'move') {
            const s = b.sent.get(en[2])
            if (s !== undefined) {
              b.inLat.push(now - s)
              b.sent.delete(en[2])
            }
          }
        }
      }
      ws.onclose = (e) => {
        resolve()
        if (b.quitting || FINAL_CODES.includes(e.code)) return
        console.error(`bot ${i} dropped (${e.code}), resuming from ${b.at}`)
        b.downAt = performance.now()
        setTimeout(() => b.connect(b.run === null ? null : { run: b.run, from: b.at }), 200)
      }
    })
  b.say = (m) => b.ws.readyState === 1 && b.ws.send(JSON.stringify(m))
  b.onTick = (t) => {
    if (t === 0) return
    const wrong = flag('desync') && i === BOTS - 1 && t === 1200 && !b.lied
    if (wrong) b.lied = true
    b.say({ t: 'hash', tick: t, h: wrong ? 'liar' : `h${t}` })
    if (t % 600 === 0 && b.roles.at(-1) === true) {
      const data = Buffer.alloc(150_000, t % 251).toString('base64')
      const parts = [data.slice(0, 100_000), data.slice(100_000)]
      parts.forEach((d, part) => b.say({ t: 'snap', tick: t, h: `h${t}`, part, parts: parts.length, data: d }))
    }
  }
  return b
}

const bots = Array.from({ length: BOTS }, (_, i) => bot(i))
for (const b of bots) await b.connect(null)
for (const b of bots) b.say({ t: 'loadout', loadout: { starter: 'pichu' } })
for (const b of bots.slice(1)) b.say({ t: 'ready', ready: true })
await sleep(500)
bots[0].say({ t: 'start' })
const startedAt = performance.now()
const timers = bots.map((b) => [
  setInterval(() => b.say({ t: 'ping', at: performance.now() }), 500),
  setInterval(() => {
    const v = b.nextIn++
    b.sent.set(v, performance.now())
    b.say({ t: 'in', k: 'move', d: [v] })
  }, 1000 / HZ),
])

if (flag('rejoin')) {
  await sleep((SECS * 1000) / 2)
  const b = bots[BOTS - 1]
  b.quitting = true
  b.ws.close()
  await sleep(1500)
  b.sent.clear()
  b.quitting = false
  await b.connect(null)
  await sleep((SECS * 1000) / 2)
} else await sleep(SECS * 1000)

timers.flat().forEach(clearInterval)
const endTick = Math.min(...bots.map((b) => b.at)) - 1
for (const b of bots) b.say({ t: 'over', tick: endTick, h: 'end' })
await sleep(2000)

check('run ended by the relay', bots.every((b) => b.ended?.tick === endTick), JSON.stringify(bots.map((b) => b.ended)))
check('one snapshot uploader', bots.filter((b) => b.roles.at(-1) === true).length <= 1)
if (flag('desync')) check('liar healed once', bots[BOTS - 1].heals === 1 && bots[BOTS - 1].syncs.some((s) => s.reason === 'heal'), `heals=${bots[BOTS - 1].heals}`)
if (flag('rejoin')) {
  const s = bots[BOTS - 1].syncs.find((x) => x.reason === 'join')
  check('fresh rejoin got a snapshot, not a replay', s && s.base && s.from === s.base.tick && s.from > 0, JSON.stringify(s && { from: s.from, to: s.to, base: s.base }))
}
const all = (k) => bots.flatMap((b) => b[k])
const out = {
  code,
  region: created.region,
  bots: BOTS,
  secs: +((performance.now() - startedAt) / 1000).toFixed(0),
  ticks: endTick,
  rtt: stats(all('rtt')),
  interArrival: stats(all('gaps')),
  over50: all('gaps').filter((g) => g > 50).length,
  over100: all('gaps').filter((g) => g > 100).length,
  inputToFrame: stats(all('inLat')),
  reconnects: bots.flatMap((b) => b.outs.map((o) => ({ bot: b.i, ...o }))),
  checks,
}
console.log(JSON.stringify(out, null, 1))
if (arg('json', null)) writeFileSync(arg('json'), JSON.stringify(out, null, 1))
for (const b of bots) {
  b.quitting = true
  b.ws.close()
}
process.exit(checks.every((c) => c.ok) ? 0 : 1)
