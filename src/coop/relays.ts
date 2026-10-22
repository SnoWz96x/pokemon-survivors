import { homeOf, type RelayHome, type VpsHome } from '../net/protocol'

/**
 * Which relay a room lives on. Cloudflare's everywhere (the default and the
 * fallback), plus the VPS relays this build has a URL for (`RELAY_URLS` in
 * `coopShell.ts`): São Paulo's for rooms whose host is in South America
 * (Cloudflare has no Durable Objects there, so a Brazilian room runs in the
 * US, 116–140 ms away) and US east's (Boston) for hosts near it. A room's code
 * says its relay (`homeOf`), so links and typed codes find it without asking anyone.
 */

/** Each VPS relay's base URL in this build (absent: that relay is off). */
export type VpsUrls = Partial<Record<VpsHome, string>>

/** A VPS relay round trip up to this (ms) can make the host's room that relay's (São Paulo: Brazil, Argentina, Uruguay, Paraguay, Chile; Boston: most of the US and Canada). Past it, Cloudflare is about as near. */
export const NEAR_RTT_MS = 70

const isVps = (home: RelayHome): home is VpsHome => home !== 'cf'

/** The relay serving room `code`: its home's when this build has it, Cloudflare's (`cf`) otherwise. */
export const relayFor = (code: string, cf: string, vps: VpsUrls) => {
  const home = homeOf(code)
  return (isVps(home) ? vps[home] : undefined) ?? cf
}

/** Where a host's new room goes: the VPS relay with the lowest round trip, if within `NEAR_RTT_MS` (null: it didn't answer), else Cloudflare. */
export const pickHome = (rtts: ReadonlyMap<VpsHome, number | null>): RelayHome => {
  let best: { home: RelayHome; rtt: number } = { home: 'cf', rtt: Infinity }
  for (const [home, rtt] of rtts) if (rtt !== null && rtt <= NEAR_RTT_MS && rtt < best.rtt) best = { home, rtt }
  return best.home
}

/**
 * The round trip to a relay (ms) as this device sees it, or null when it
 * doesn't answer: one `GET /health` to open the connection (DNS, TCP, TLS),
 * then the best of `tries` more on it (one stops early when clearly far).
 */
export const measureRtt = async (url: string, get: (url: string) => Promise<unknown>, now: () => number, tries = 3): Promise<number | null> => {
  try {
    await get(`${url}/health`)
    let best = Infinity
    for (let i = 0; i < tries; i++) {
      const at = now()
      await get(`${url}/health`)
      best = Math.min(best, now() - at)
      // Clearly near or clearly far: more tries won't change the pick.
      if (best <= NEAR_RTT_MS / 2 || best >= NEAR_RTT_MS * 3) break
    }
    return best
  } catch {
    return null
  }
}
