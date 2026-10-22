import { describe, expect, it } from 'vitest'
import { createCoopClient } from './client'
import { SA_MAX_RTT_MS, measureRtt, pickHome, relayFor } from './relays'

const CF = 'https://cf.test'
const SA = 'https://sa.test'

describe('relays', () => {
  it('finds a room on the relay its code names, and on Cloudflare in a build without São Paulo', () => {
    expect(relayFor('9K7QF', CF, SA)).toBe(SA)
    expect(relayFor('K7QF2', CF, SA)).toBe(CF)
    expect(relayFor('9K7QF', CF, null)).toBe(CF)
  })

  it("puts a host's room in São Paulo only when it answers near", () => {
    expect(pickHome(8)).toBe('sa')
    expect(pickHome(SA_MAX_RTT_MS + 1)).toBe('cf')
    expect(pickHome(null)).toBe('cf')
  })

  it('measures the best round trip after the one that opens the connection, null when unreachable', async () => {
    let now = 0
    const waits = [400, 50, 45, 48]
    const get = async () => void (now += waits.shift() ?? 0)
    expect(await measureRtt(SA, get, () => now)).toBe(45)
    expect(await measureRtt(SA, () => Promise.reject(new Error('offline')), () => now)).toBeNull()
  })

  it('creates on São Paulo when near, and on Cloudflare when São Paulo is down', async () => {
    const posted: string[] = []
    const client = (saUp: boolean) =>
      createCoopClient({
        url: CF,
        saUrl: SA,
        build: 'b1',
        socket: () => ({ send: () => {}, close: () => {}, isOpen: () => false, buffered: () => 0 }),
        fetch: async (url, init) => {
          if (url.startsWith(SA) && !saUp) throw new Error('offline')
          if (init.method === 'POST') posted.push(url)
          return { json: async () => (url.startsWith(SA) ? { code: '9K7QF', region: 'sam' } : { code: 'K7QF2', region: 'enam' }) }
        },
        store: { get: () => null, set: () => {}, remove: () => {}, keys: () => [] },
        token: async () => null,
        name: () => 'Ash',
        now: () => 0,
        random: () => 0.5,
      })
    expect(await client(true).create()).toMatchObject({ ok: true, code: '9K7QF', home: 'sa' })
    expect(await client(false).create()).toMatchObject({ ok: true, code: 'K7QF2', home: 'cf' })
    expect(posted).toEqual([`${SA}/rooms`, `${CF}/rooms`])
  })
})
