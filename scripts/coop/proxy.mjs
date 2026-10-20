// A TCP-level chaos proxy for the co-op relay: each client gets its own port, and every byte
// between it and the relay is delayed by a one-way latency ± jitter, in order (like a real link:
// one late packet holds back everything after it). Loss shows up as TCP does it: a lost packet is
// resent a round trip later (fast retransmit; 1 in 10 waits out a 300 ms timeout), holding the stream. A stall holds a client's bytes both
// ways for some seconds (the single-socket stalls measured on home Wi-Fi), a cut kills its sockets.
// HTTP (`POST /rooms`) and WebSockets go through unchanged.
//
//   node scripts/coop/proxy.mjs --upstream 8796 --ports 4011,4012 --profile br   (standalone, for browsers;
//     control on --control 4399: /cut?port=4011, /stall?port=4011&ms=3500, /profile?port=4011&name=us)
//   import { startProxy, PROFILES } from './proxy.mjs'                           (the soak)
import { createServer } from 'node:http'
import net from 'node:net'

/** One-way latency and jitter (ms), loss (share of chunks) and stalls (every `every` ms, `ms` long). */
export const PROFILES = {
  /** Brazil ↔ Miami: 130 ms RTT ± 40, 1% loss, a 3–4 s stall every ~90 s. */
  br: { lat: 65, jit: 20, loss: 0.01, stall: { every: 90_000, ms: [3000, 4000] } },
  /** The US: 40 ms RTT, a little jitter, no loss. */
  us: { lat: 20, jit: 5, loss: 0, stall: null },
  /** Straight through. */
  lan: { lat: 0, jit: 0, loss: 0, stall: null },
}

/** Extra delay of a lost packet: fast retransmit after a round trip and three packets, or now and then a timeout. */
const retransmit = (p) => (Math.random() < 0.1 ? 300 : 2 * p.lat + 50) * (0.8 + Math.random() * 0.4)

/** An ordered delayed pipe from one socket to another. */
const pipe = (link, to) => {
  let last = 0
  const queue = []
  let timer = null
  const pump = () => {
    timer = null
    const now = Date.now()
    while (queue.length && queue[0].at <= now && now >= link.stallUntil) {
      const { data } = queue.shift()
      if (!to.destroyed) to.write(data)
    }
    if (queue.length) timer = setTimeout(pump, Math.max(1, Math.max(queue[0].at, link.stallUntil) - now))
  }
  return (data) => {
    const p = link.profile
    const delay = p.lat + (p.jit ? (Math.random() * 2 - 1) * p.jit : 0) + (p.loss && Math.random() < p.loss ? retransmit(p) : 0)
    const at = Math.max(last, Date.now() + delay)
    last = at
    queue.push({ at, data })
    if (!timer) timer = setTimeout(pump, Math.max(0, Math.max(at, link.stallUntil) - Date.now()))
  }
}

/** Listens on `port`, forwarding to the relay on `upstream`, shaped by `profile`. Returns its controls. */
export const startProxy = ({ port, upstream, profile = PROFILES.lan, host = '127.0.0.1' }) => {
  const link = { profile, stallUntil: 0, sockets: new Set(), stalls: 0, cuts: 0, bytes: { up: 0, down: 0 } }
  const server = net.createServer((client) => {
    client.setNoDelay(true)
    const relay = net.connect(upstream, host)
    relay.setNoDelay(true)
    link.sockets.add(client).add(relay)
    const up = pipe(link, relay)
    const down = pipe(link, client)
    client.on('data', (d) => ((link.bytes.up += d.length), up(d)))
    relay.on('data', (d) => ((link.bytes.down += d.length), down(d)))
    const end = () => {
      link.sockets.delete(client)
      link.sockets.delete(relay)
      client.destroy()
      relay.destroy()
    }
    client.on('close', end).on('error', end)
    relay.on('close', end).on('error', end)
  })
  server.listen(port, host)
  let stallTimer = null
  const scheduleStall = () => {
    const s = link.profile.stall
    if (!s) return
    stallTimer = setTimeout(() => {
      stall(s.ms[0] + Math.random() * (s.ms[1] - s.ms[0]))
      scheduleStall()
    }, s.every * (0.6 + Math.random() * 0.8))
  }
  const stall = (ms) => {
    link.stalls++
    link.stallUntil = Math.max(link.stallUntil, Date.now() + ms)
  }
  scheduleStall()
  return {
    port,
    link,
    set: (p) => (link.profile = p),
    stall,
    cut: () => {
      link.cuts++
      for (const s of link.sockets) s.destroy()
      link.sockets.clear()
    },
    close: () => {
      clearTimeout(stallTimer)
      for (const s of link.sockets) s.destroy()
      server.close()
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i < 0 ? fallback : process.argv[i + 1]
  }
  const upstream = Number(arg('upstream', 8796))
  const profile = PROFILES[arg('profile', 'br')]
  const proxies = new Map(arg('ports', '4011').split(',').map(Number).map((port) => [port, startProxy({ port, upstream, profile })]))
  createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    const p = proxies.get(Number(u.searchParams.get('port')))
    if (p && u.pathname === '/cut') p.cut()
    if (p && u.pathname === '/stall') p.stall(Number(u.searchParams.get('ms') ?? 3500))
    if (p && u.pathname === '/profile') p.set(PROFILES[u.searchParams.get('name')] ?? p.link.profile)
    res.end(JSON.stringify(p ? { stalls: p.link.stalls, cuts: p.link.cuts, bytes: p.link.bytes } : { ports: [...proxies.keys()] }))
  }).listen(Number(arg('control', 4399)), '127.0.0.1')
  console.log(`proxy ${arg('ports', '4011')} → :${upstream} (${arg('profile', 'br')})`)
}
