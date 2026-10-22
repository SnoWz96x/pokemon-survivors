import { describe, expect, it } from 'vitest'
import type { Hello } from '../net/protocol'
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
  const client = createCoopClient({
    url: 'https://relay.test',
    build: 'b1',
    socket: (_, on) => {
      sockets.push(on)
      return {
        send: (d) => {
          const m: unknown = JSON.parse(d)
          if (typeof m === 'object' && m !== null && 't' in m && m.t === 'hello') hellos.push(m as Hello)
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
  return { client, sockets, hellos, tick: (ms: number) => (now += ms) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

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
})
