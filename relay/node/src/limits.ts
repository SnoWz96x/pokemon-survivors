/**
 * Per-IP rate limits in memory, the Worker's `ratelimits` on one server: at
 * most `limit` hits per key in each fixed window of `periodMs`. Generous, as
 * there: a whole carrier NAT can sit behind one IP.
 */
export type Limiter = {
  /** Counts a hit for `key` at `now` (ms): false when it is past the limit. */
  hit: (key: string, now: number) => boolean
  /** Forgets windows that are over (call now and then). */
  sweep: (now: number) => void
}

export const createLimiter = (limit: number, periodMs: number): Limiter => {
  const windows = new Map<string, { start: number; n: number }>()
  return {
    hit: (key, now) => {
      const w = windows.get(key)
      if (!w || now - w.start >= periodMs) {
        windows.set(key, { start: now, n: 1 })
        return limit >= 1
      }
      w.n++
      return w.n <= limit
    },
    sweep: (now) => {
      for (const [k, w] of windows) if (now - w.start >= periodMs) windows.delete(k)
    },
  }
}

/** The Worker's limits (`wrangler.jsonc`): rooms created and sockets opened, per IP a minute. */
export const LIMITS = { create: { limit: 30, periodMs: 60_000 }, connect: { limit: 300, periodMs: 60_000 } } as const

/**
 * The player's address: behind the reverse proxy (Traefik on the VPS, the only
 * way in) the header it sets (`ipHeader`, e.g. `x-real-ip`), else the socket's own.
 */
export const clientIp = (headers: Record<string, string | string[] | undefined>, remote: string | undefined, ipHeader: string | null) => {
  const v = ipHeader ? headers[ipHeader] : undefined
  const ip = (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim()
  return ip || remote || 'unknown'
}
