/**
 * In-memory rate limits (each API instance keeps its own): enough to brake a
 * script, without a table for something that only matters for a few minutes.
 */

/** Past this many keys a hit also sweeps the ones whose window is over, so the map can't grow without end. */
const SWEEP_AT = 10_000

/**
 * A sliding window per key: at most `limit` hits in `windowMs`. `take` counts
 * a hit on every key at once, and only when all of them still have room (a
 * report counts against its IP and its account, or neither).
 */
export const rateLimiter = (limit: number, windowMs: number) => {
  const hits = new Map<string, number[]>()
  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter((at) => now - at < windowMs)
  return {
    take: (keys: readonly string[], now: number) => {
      const windows = keys.map((key) => recent(key, now))
      if (windows.some((w) => w.length >= limit)) return false
      keys.forEach((key, i) => hits.set(key, [...windows[i]!, now]))
      if (hits.size > SWEEP_AT) for (const key of hits.keys()) if (recent(key, now).length === 0) hits.delete(key)
      return true
    },
  }
}
