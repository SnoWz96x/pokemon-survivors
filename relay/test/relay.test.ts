import { abortAllDurableObjects } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { PROTOCOL, type ClientMessage, type CreateResponse, type Hello, type ServerMessage } from '../../src/net/protocol'

type Client = { ws: WebSocket; inbox: ServerMessage[]; closed: Promise<number> }

const isServerMessage = (v: unknown): v is ServerMessage => typeof v === 'object' && v !== null && 't' in v

const open = async (code: string): Promise<Client> => {
  const res = await exports.default.fetch(`https://relay.test/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } })
  const ws = res.webSocket
  if (!ws) throw new Error(`no socket: ${res.status}`)
  ws.accept()
  const inbox: ServerMessage[] = []
  ws.addEventListener('message', (e) => {
    const v: unknown = JSON.parse(String(e.data))
    if (isServerMessage(v)) inbox.push(v)
  })
  const closed = new Promise<number>((resolve) => ws.addEventListener('close', (e) => resolve(e.code)))
  return { ws, inbox, closed }
}

const say = (c: Client, msg: ClientMessage) => c.ws.send(JSON.stringify(msg))

/** Waits for the first message (from the start of the inbox) that `pick` accepts. */
const waitFor = async <T,>(c: Client, pick: (m: ServerMessage) => T | null, ms = 8000): Promise<T> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    for (const m of c.inbox) {
      const v = pick(m)
      if (v !== null) return v
    }
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`timed out; got ${c.inbox.map((m) => m.t).join(',')}`)
}

const hello = (code: string, guest: string, over: Partial<Hello> = {}): Hello => ({
  t: 'hello',
  v: PROTOCOL,
  build: 'b1',
  room: code,
  auth: { kind: 'guest', id: guest },
  secret: null,
  name: guest.slice(0, 5),
  resume: null,
  ...over,
})

const createRoom = async () => {
  const res = await exports.default.fetch('https://relay.test/rooms', { method: 'POST', body: JSON.stringify({ v: PROTOCOL, build: 'b1' }) })
  const body: CreateResponse = await res.json()
  if (!('code' in body)) throw new Error(`create failed: ${JSON.stringify(body)}`)
  return body.code
}

const A = 'guest-aaaaaaaaaaaaaaaa'
const B = 'guest-bbbbbbbbbbbbbbbb'

describe('relay', () => {
  it('serves a real health check', async () => {
    const res = await exports.default.fetch('https://relay.test/health')
    expect(await res.json()).toMatchObject({ ok: true, protocol: PROTOCOL })
  })

  it('keeps a run through a Durable Object restart: clients resume from their tick, the log survives', async () => {
    const code = await createRoom()
    const a = await open(code)
    say(a, hello(code, A))
    const secretA = await waitFor(a, (m) => (m.t === 'welcome' ? m.secret : null))
    say(a, { t: 'loadout', loadout: { starter: 'pichu' } })
    const b = await open(code)
    say(b, hello(code, B))
    const secretB = await waitFor(b, (m) => (m.t === 'welcome' ? m.secret : null))
    say(b, { t: 'loadout', loadout: { starter: 'gible' } })
    say(b, { t: 'ready', ready: true })
    await waitFor(a, (m) => (m.t === 'room' && m.room.members[1]?.ready ? true : null))
    say(a, { t: 'start' })
    await waitFor(b, (m) => (m.t === 'start' ? true : null))

    say(a, { t: 'in', k: 'move', d: [7] })
    const stamped = await waitFor(b, (m) => (m.t === 'frame' ? (m.ticks.find(([, es]) => es.some((e) => e[0] === 0 && e[2] === 7))?.[0] ?? null) : null))
    await new Promise((r) => setTimeout(r, 300))
    const seen = Math.max(...a.inbox.flatMap((m) => (m.t === 'frame' ? [m.to] : [])))

    // A crash or a deploy: the instance is torn down at once, storage stays.
    await abortAllDurableObjects()
    await Promise.all([a.closed, b.closed])

    // A comes back with its state at `seen`: it gets the tail from there, nothing replayed.
    const a2 = await open(code)
    say(a2, hello(code, A, { secret: secretA, resume: { run: 1, from: seen } }))
    const sync = await waitFor(a2, (m) => (m.t === 'sync' ? m : null))
    expect(sync).toMatchObject({ reason: 'resume', from: seen })
    expect(sync.to).toBeGreaterThanOrEqual(seen)
    const live = await waitFor(a2, (m) => (m.t === 'frame' && m.from >= sync.to ? m : null))
    expect(live.from).toBe(sync.to)

    // B lost its state: it starts from the seed and gets the whole (short) log, with A's input where it was stamped.
    const b2 = await open(code)
    say(b2, hello(code, B, { secret: secretB }))
    const fresh = await waitFor(b2, (m) => (m.t === 'sync' ? m : null))
    expect(fresh).toMatchObject({ reason: 'join', from: 0, base: null })
    const replayed = await waitFor(b2, (m) => (m.t === 'frame' && m.from === 0 ? m : null))
    expect(replayed.ticks).toContainEqual([stamped, [[0, 'move', 7]]])
  })
})
