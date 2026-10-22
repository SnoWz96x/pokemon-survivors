import { homeOf, type RelayHome } from '../net/protocol'

/**
 * Which relay a room lives on. Cloudflare's (`url`) everywhere, plus, when the
 * build has one (`VITE_COOP_URL_SA`), the São Paulo relay for rooms whose host
 * is in South America: Cloudflare has no Durable Objects there, so a Brazilian
 * room runs in the US, 116–140 ms away, where São Paulo answers in under 10.
 * A room's code says its relay (`homeOf`), so links and typed codes find it.
 */

/** A São Paulo round trip up to this (ms) makes the host's room São Paulo's: Brazil, Argentina, Uruguay, Paraguay, Chile. Past it, Cloudflare's US relay is about as near. */
export const SA_MAX_RTT_MS = 70

/** The relay serving room `code`: São Paulo's for its codes when this build has it, Cloudflare's otherwise. */
export const relayFor = (code: string, url: string, saUrl: string | null) => (saUrl && homeOf(code) === 'sa' ? saUrl : url)

/** Where a host's new room goes, from the São Paulo relay's round trip (null: it didn't answer). */
export const pickHome = (rtt: number | null): RelayHome => (rtt !== null && rtt <= SA_MAX_RTT_MS ? 'sa' : 'cf')

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
      if (best <= SA_MAX_RTT_MS / 2 || best >= SA_MAX_RTT_MS * 3) break
    }
    return best
  } catch {
    return null
  }
}
