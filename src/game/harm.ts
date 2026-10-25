import type { HitKind } from '../data/abilities'
import type { EnemyId } from '../data/enemies'
import type { Enemy, Player } from './types'

/**
 * Who hurt a player, for the end screen's cause of a faint: the foe's species
 * (null for lava, a trap or the world), whether it was an Alpha, the attack's
 * official English name when it has one (a boss's ultimate), and `world` for
 * the world's own attacks (`game/hazards.ts`). Bookkeeping only: the
 * simulation never reads it, so tagging a hit changes no outcome.
 */
export type HarmBy = { foe: EnemyId | null; alpha: boolean; move: string | null; world: boolean }

/** A hit a player took (`hurtPlayer`): who dealt it, what kind of harm (`HitKind`) and the HP it took. */
export type Harm = HarmBy & { hit: HitKind; dmg: number }

/** How many of their last hits a player keeps (`Player.hits`): the one that fainted them and the two before. */
export const HITS_KEPT = 3

/** A foe (or a species, for a rift's own hazards) as the one who hurt a player, with its attack's name when it has one. */
export const harmBy = (foe: Enemy | EnemyId, move: string | null = null): HarmBy =>
  typeof foe === 'string' ? { foe, alpha: false, move, world: false } : { foe: foe.kind, alpha: foe.alpha !== null, move, world: false }

/** The world's own attacks (the weather's and the biome's strikes). */
export const WORLD_HARM: HarmBy = { foe: null, alpha: false, move: null, world: true }

/** Nobody in particular: lava, a trap. The hit's kind says the rest. */
export const NO_ONE: HarmBy = { foe: null, alpha: false, move: null, world: false }

/** Keeps a hit on `p`'s last hits, dropping the oldest past `HITS_KEPT`. */
export const noteHit = (p: Player, by: HarmBy, hit: HitKind, dmg: number) => {
  p.hits.push({ ...by, hit, dmg })
  if (p.hits.length > HITS_KEPT) p.hits.shift()
}
