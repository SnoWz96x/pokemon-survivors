/** A source of floats in [0, 1). Rules take any; the runs' own is a `SeededRng`. */
export type Rng = () => number

/** Mulberry32's whole state: one 32-bit word, as plain data so a run's snapshot carries it (`game/snapshot.ts`). */
export type RngState = { a: number }

/** A seeded rng: a function that reads and advances its `state` record, and nothing else. */
export type SeededRng = Rng & { readonly state: RngState }

/**
 * The rng bound to `state` (mulberry32): every draw advances `state.a`, so
 * rebuilding it on a restored state goes on with the same sequence.
 */
export const rngFrom = (state: RngState): SeededRng =>
  Object.assign(() => {
    const a = (state.a = (state.a + 0x6d2b79f5) >>> 0)
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }, { state })

/** Seeded PRNG (mulberry32). Returns floats in [0, 1). */
export const createRng = (seed: number): SeededRng => rngFrom({ a: seed >>> 0 })

export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min)

export const chance = (rng: Rng, p: number) => rng() < p

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!

export const weightedPick = <T>(rng: Rng, entries: ReadonlyArray<readonly [T, number]>): T => {
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [item, weight] of entries) {
    roll -= weight
    if (roll <= 0) return item
  }
  return entries[entries.length - 1]![0]
}

/** Stateless integer hash → [0, 1). Used for deterministic world generation. */
export const hash2 = (x: number, y: number, seed = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** FNV-1a: a stable 32-bit seed from text (a date, a period key), for draws everyone gets the same. */
export const seedFrom = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}
