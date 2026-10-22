import { describe, expect, it } from 'vitest'
import type { ClientMessage, Hello, RoomView } from '../net/protocol'
import type { Store } from './bank'
import { CONNECT, createCoopClient, type SocketHandlers } from './client'

/** A client on fake sockets: `sockets` are the ones it opened, `hellos` what each sent first. */
const harness = () => {
  let now = 0
  let tokens = 0
  const kept = new Map<string, string>()
  const store: Store = { get: (k) => kept.get(k) ?? null, set: (k, v) => void kept.set(k, v), remove: (k) => void kept.delete(k), keys: () => [...kept.keys()] }
  const sockets: SocketHandlers[] = []
  const hellos: Hello[] = []
  const sent: ClientMessage[] = []
  const client = createCoopClient({
    url: 'https://relay.test',
    build: 'b1',
    socket: (_, on) => {
      sockets.push(on)
      return {
        send: (d) => {
          const m = JSON.parse(d) as ClientMessage
          if (m.t === 'hello') hellos.push(m)
          else sent.push(m)
        },
        close: () => {},
        isOpen: () => true,
        buffered: () => 0,
      }
    },
    fetch: () => Promise.reject(new Error('offline')),
    store,
    token: async () => `token-${++tokens}`,
    name: () => '@ash',
    now: () => now,
    random: () => 0.5,
  })
  return { client, sockets, hellos, sent, tick: (ms: number) => (now += ms) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

const room: RoomView = { code: 'ABCDE', phase: 'playing', members: [], settings: {}, run: 1 }

/** A client seated in a playing room by a relay that does (or doesn't) take batches. */
const seated = async (batch: boolean) => {
  const h = harness()
  void h.client.join('ABCDE')
  await flush()
  h.sockets[0]?.open()
  h.sockets[0]?.message(JSON.stringify({ t: 'welcome', seat: 0, secret: 'secret-0000000000', room, ...(batch ? { batch: true } : {}) }))
  h.client.frame(1 / 60)
  h.sent.length = 0
  return h
}

describe('the co-op client', () => {
  it('asks for a fresh Clerk token on every (re)connect, never reusing one', async () => {
    const h = harness()
    void h.client.join('ABCDE')
    await flush()
    h.sockets[0]?.open()
    // A drop (not a final close): it reconnects after its backoff, with a new token.
    h.sockets[0]?.close(1006)
    h.tick(CONNECT.max * 2)
    h.client.frame(1 / 60)
    await flush()
    h.sockets[1]?.open()
    expect(h.hellos.map((m) => (m.auth.kind === 'clerk' ? m.auth.token : null))).toEqual(['token-1', 'token-2'])
    expect(h.hellos.map((m) => m.name)).toEqual(['@ash', '@ash'])
  })

  it('sends the inputs of a frame and the ping due as one batch, and one by one to a relay without batches', async () => {
    for (const batch of [true, false]) {
      const h = await seated(batch)
      h.client.input({ k: 'special', sample: 1 })
      h.client.input({ k: 'skip', round: 3 })
      h.tick(CONNECT.ping)
      h.client.frame(1 / 60)
      const kinds = h.sent.flatMap((m) => (m.t === 'batch' ? [m.m.map((x) => x.t)] : [[m.t]]))
      expect(kinds).toEqual(batch ? [['in', 'in', 'ping']] : [['in'], ['in'], ['ping']])
    }
  })

  it('stays quiet while nothing is due, then says it is here once a heartbeat', async () => {
    const h = await seated(true)
    for (let ms = 0; ms < CONNECT.heartbeat - 20; ms += 16) {
      h.tick(16)
      h.client.frame(1 / 60)
    }
    expect(h.sent).toEqual([])
    h.tick(20)
    h.client.frame(1 / 60)
    expect(h.sent).toHaveLength(1)
  })
})
