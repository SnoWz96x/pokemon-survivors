import { decodeSnapshot, deflate, restore, snapshot, stateHash } from '../game/snapshot'
import { diffStates } from '../game/stateDiff'
import { PLAYABLE_IDS } from '../data/hatchlings'
import { LEGEND_IDS } from '../data/legends'
import { startScenario, tickScenario, type Driver, type Scenario } from './scenario'

/**
 * The cross-engine determinism harness's entry (`scripts/determinism.mjs`
 * bundles it once and loads the same bundle in Node, Chromium, Firefox and
 * WebKit). Every function here is pure and plain-data in, plain-data out, so
 * it crosses `page.evaluate` as is.
 */

export { decodeSnapshot, diffStates, restore, snapshot, stateHash }

/**
 * The runs the harness plays: long, busy ones (bosses, rifts, evolutions, a
 * Mega line, a branching one, endless mode, every difficulty, a haunted
 * Legend-mode run, a run with Bag items, armed shop TMs and Bottle Caps), then
 * every playable (legends too) for a few minutes, so each family's own moves
 * get played too.
 */
export const HARNESS_SCENARIOS: ReadonlyArray<{ name: string; scenario: Scenario; minutes: number }> = [
  { name: 'squirtle-normal-25min', scenario: { seed: 2, starter: 'squirtle', difficulty: 'normal', maxRanks: true }, minutes: 25 },
  { name: 'charmander-hard-mega-15min', scenario: { seed: 31, starter: 'charmander', difficulty: 'hard', maxRanks: true }, minutes: 15 },
  { name: 'eevee-nightmare-12min', scenario: { seed: 977, starter: 'eevee', difficulty: 'nightmare', maxRanks: true }, minutes: 12 },
  { name: 'gible-normal-10min', scenario: { seed: 4242, starter: 'gible', difficulty: 'normal', maxRanks: false }, minutes: 10 },
  { name: 'kyogre-legend-haunted-12min', scenario: { seed: 5150, starter: 'kyogre', difficulty: 'normal', maxRanks: true, halloween: true }, minutes: 12 },
  {
    name: 'bulbasaur-bag-tms-caps-10min',
    scenario: { seed: 777, starter: 'bulbasaur', difficulty: 'hard', maxRanks: true, bag: ['rareCandy', 'luckyEgg', 'xAttack', 'maxRevive'], tms: ['payDay', 'thief', 'rainDance', 'swordsDance'], caps: 3 },
    minutes: 10,
  },
  ...[...PLAYABLE_IDS, ...LEGEND_IDS].map((starter, i) => ({
    name: `${starter}-3min`,
    scenario: { seed: 100 + i, starter, difficulty: (['normal', 'hard', 'nightmare'] as const)[i % 3]!, maxRanks: true },
    minutes: 3,
  })),
]

/** Where a run stood when it stopped, for the summary. */
export type RunEnd = {
  tick: number
  time: number
  phase: string
  level: number
  stage: number
  branch: string | null
  megas: number
  kills: number
  biome: string
  rifts: number
  endless: boolean
}

const end = (d: Driver): RunEnd => ({
  tick: d.tick,
  time: d.g.time,
  phase: d.g.phase,
  level: d.g.player.level,
  stage: d.g.player.stage,
  branch: d.g.player.branch,
  megas: d.g.player.mega.count,
  kills: d.g.kills,
  biome: d.g.biome.id,
  rifts: d.g.rift.cleared.length,
  endless: d.g.endless !== null,
})

/** Plays `s` up to `ticks` (or its end), hashing the state every `every` ticks (and at the last one). */
export const runHashes = (s: Scenario, ticks: number, every = 60) => {
  const d = startScenario(s)
  const hashes: Array<[tick: number, hash: string]> = []
  let busiest = 0
  while (d.tick < ticks && tickScenario(d)) {
    if (d.tick % every === 0) hashes.push([d.tick, stateHash(d.g)])
    busiest = Math.max(busiest, d.g.enemies.length)
  }
  if (hashes.at(-1)?.[0] !== d.tick) hashes.push([d.tick, stateHash(d.g)])
  return { hashes, end: end(d), busiest }
}

/** The hash after each tick in (`from`, `to`]: where in a window two engines part. */
export const hashesBetween = (s: Scenario, from: number, to: number) => {
  const d = startScenario(s)
  const hashes: Array<[tick: number, hash: string]> = []
  while (d.tick < to && tickScenario(d)) if (d.tick > from) hashes.push([d.tick, stateHash(d.g)])
  return hashes
}

const toBase64 = (bytes: Uint8Array) => {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

/** The run's snapshot after `tick` ticks, as base64 (so it crosses into Node). */
export const snapshotAt = (s: Scenario, tick: number) => {
  const d = startScenario(s)
  while (d.tick < tick && tickScenario(d));
  return toBase64(snapshot(d.g))
}

/** Where two snapshots differ, one line each. */
export const diffSnapshots = (a: Uint8Array, b: Uint8Array, limit = 60) => diffStates(decodeSnapshot(a).state, decodeSnapshot(b).state, { limit })

const median = (f: () => unknown, n: number) => {
  for (let i = 0; i < 5; i++) f()
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    f()
    times.push(performance.now() - t)
  }
  return times.sort((a, b) => a - b)[n >> 1]!
}

/** Snapshot size and the cost of a snapshot, a restore and a hash (median ms) at each of `minutes` of `s`. */
export const bench = async (s: Scenario, minutes: readonly number[], n = 30) => {
  const d = startScenario(s)
  const rows = []
  for (const m of minutes) {
    while (d.g.time < m * 60 && tickScenario(d));
    const bytes = snapshot(d.g)
    const small = await deflate(bytes)
    rows.push({
      minute: m,
      enemies: d.g.enemies.length,
      attacks: d.g.attacks.length,
      pickups: d.g.pickups.length,
      particles: d.g.particles.length,
      raw: bytes.length,
      deflated: small.length,
      snapshotMs: median(() => snapshot(d.g), n),
      restoreMs: median(() => restore(bytes), n),
      hashMs: median(() => stateHash(d.g), n),
    })
  }
  return rows
}
