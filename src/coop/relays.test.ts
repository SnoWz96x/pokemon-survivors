import { describe, expect, it } from 'vitest'
import { createCoopClient } from './client'
import { NEAR_RTT_MS, measureRtt, pickHome, relayFor } from './relays'

const CF = 'https://cf.test'
const SA = 'https://sa.test'
const US = 'https://us.test'

describe('relays', () => {
  it('finds a room on the relay its code names, and on Cloudflare when this build lacks that relay', () => {
    const both = { sa: SA, us: US }
    expect(relayFor('3K7QF', CF, both)).toBe(SA)
    expect(relayFor('7K7QF', CF, both)).toBe(US)
    expect(relayFor('K7QF2', CF, both)).toBe(CF)
    // A build without the US relay sends its codes to Cloudflare.
    expect(relayFor('7K7QF', CF, { sa: SA })).toBe(CF)
  })

  it("puts a host's room on the nearest VPS relay within the cap, else on Cloudflare", () => {
    const rtts = (sa: number | null, us: number | null) => new Map([['sa', sa], ['us', us]] as const)
    // São Paulo (São Paulo 8 ms, Boston ~120), Buenos Aires (35 / 150).
    expect(pickHome(rtts(8, 120))).toBe('sa')
    expect(pickHome(rtts(35, 150))).toBe('sa')
    // New York (120 / 8), Chicago (140 / 25), Los Angeles (180 / 65).
    expect(pickHome(rtts(120, 8))).toBe('us')
    expect(pickHome(rtts(140, 25))).toBe('us')
    expect(pickHome(rtts(180, 65))).toBe('us')
    // Lisbon (200 / 85), Tokyo (260 / 170), a relay down, none in the build.
    expect(pickHome(rtts(200, 85))).toBe('cf')
    expect(pickHome(rtts(260, 170))).toBe('cf')
    expect(pickHome(rtts(NEAR_RTT_MS + 1, null))).toBe('cf')
    expect(pickHome(rtts(null, 12))).toBe('us')
    expect(pickHome(new Map())).toBe('cf')
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
        vps: { sa: SA },
        build: 'b1',
        socket: () => ({ send: () => {}, close: () => {}, isOpen: () => false, buffered: () => 0 }),
        fetch: async (url, init) => {
          if (url.startsWith(SA) && !saUp) throw new Error('offline')
          if (init.method === 'POST') posted.push(url)
          return { json: async () => (url.startsWith(SA) ? { code: '3K7QF', region: 'sam' } : { code: 'K7QF2', region: 'enam' }) }
        },
        store: { get: () => null, set: () => {}, remove: () => {}, keys: () => [] },
        token: async () => null,
        name: () => 'Ash',
        now: () => 0,
        random: () => 0.5,
      })
    expect(await client(true).create()).toMatchObject({ ok: true, code: '3K7QF', home: 'sa' })
    expect(await client(false).create()).toMatchObject({ ok: true, code: 'K7QF2', home: 'cf' })
    expect(posted).toEqual([`${SA}/rooms`, `${CF}/rooms`])
  })
})
