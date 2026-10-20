import { chance, weightedPick, type Rng } from '../engine/rng'
import type { EnemyId } from '../data/enemies'
import { HATCHLING_IDS, HATCHLINGS, isHatchling, isStarter, type HatchlingId, type PlayableId } from '../data/hatchlings'
import { RIFT_LEGENDS } from '../data/rifts'
import { GRAVEYARD } from '../data/places'
import { MYTHICALS } from '../data/waves'
import { markHatch } from './dex'
import { REAPER } from './endless'
import type { Save } from './meta'

/**
 * Eggs: a few drop in runs (bosses, locked chests, rifts, places), wait in a small
 * incubator and hatch after enough steps walked inside runs, unlocking a
 * playable family (`data/hatchlings.ts`). Pure rules: the simulation awards
 * them (`awardEgg` in `pickups.ts`) and `ui/save.ts` persists them.
 */

/**
 * An egg tier: the steps it walks to hatch, the ₽ it pays when it can't fit
 * (or hatches a duplicate), `even` odds among its families, the tier whose
 * families it hatches when not its own (`families`) and a hatch that's always `shiny`.
 */
type EggTierRule = { steps: number; refund: number; even?: boolean; families?: string; shiny?: boolean }

export const EGG_TIERS = {
  common: { steps: 2000, refund: 300 },
  rare: { steps: 4000, refund: 600 },
  ultra: { steps: 8000, refund: 1200 },
  /** The Friendship Egg: only a Mystery Gift for an invite brings it (`game/referral.ts`), and only Munchlax comes out. */
  friend: { steps: 2000, refund: 600 },
  /**
   * The Haunted Egg: only Duskull's stall sells it, on the Noite das Bruxas
   * (`STALLS` in `data/visitors.ts`), and only its four ghosts come out, at
   * `even` odds (no nudge towards the families not hatched yet, as the stall shows).
   */
  haunted: { steps: 3000, refund: 1500, even: true },
  /**
   * The Kecleon Egg: only the Vitrine's fixed card sells it (`VITRINE.kecleonEgg`,
   * `game/shop.ts`), one a day, and only its four families come out (Porygon,
   * Exeggcute, Scraggy and Smeargle), at `even` odds, as the card shows.
   */
  kecleon: { steps: 4000, refund: 2500, even: true },
  /** The loyalty card's 100-stamp gift (`LOYALTY`): a Kecleon Egg whose hatch is always shiny. */
  kecleonShiny: { steps: 4000, refund: 2500, even: true, families: 'kecleon', shiny: true },
} as const satisfies Record<string, EggTierRule>

export type EggTier = keyof typeof EGG_TIERS

export const EGG_TIER_IDS = Object.keys(EGG_TIERS) as EggTier[]

export const EGGS = {
  /** Incubator slots. An egg that finds them full is paid out in ₽ (its tier's `refund`). */
  slots: 3,
  /** Eggs a single run can drop. */
  perRun: 2,
  /** World px per step: the base speed (68 px/s) walks about 4 steps a second. */
  stepPx: 16,
  shinyOdds: 1 / 100,
  /** Families not hatched yet are this many times likelier to come out. */
  newWeight: 3,
} as const

type DropRule = { chance: number; odds: Partial<Record<EggTier, number>> }

/** Odds that each source leaves an egg, and the weights of its tier. */
export const EGG_SOURCES = {
  boss: { chance: 0.15, odds: { common: 70, rare: 25, ultra: 5 } },
  chest: { chance: 0.1, odds: { common: 85, rare: 15 } },
  rift: { chance: 0.4, odds: { rare: 65, ultra: 35 } },
  /** The cave's treasure chest and Spiritomb (`data/places.ts`). */
  place: { chance: 0.25, odds: { common: 55, rare: 40, ultra: 5 } },
  final: { chance: 1, odds: { rare: 70, ultra: 30 } },
  reaper: { chance: 1, odds: { ultra: 1 } },
  /** A defended nest (`fieldMissions.ts`): the mission rolls its own odds per difficulty first. */
  mission: { chance: 1, odds: { common: 60, rare: 35, ultra: 5 } },
} as const satisfies Record<string, DropRule>

export type EggSource = keyof typeof EGG_SOURCES

/** The egg rule of a fainted boss: rift legendaries, Arceus, Mewtwo, the mythicals (Mew, Celebi, Jirachi) and places' bosses have their own. */
export const bossEggSource = (kind: EnemyId): EggSource =>
  kind === REAPER
    ? 'reaper'
    : RIFT_LEGENDS.some((id) => id === kind)
      ? 'rift'
      : kind === 'mewtwo' || MYTHICALS.some((id) => id === kind)
        ? 'final'
        : kind === GRAVEYARD.boss
          ? 'place'
          : 'boss'

/* ---------------- In a run ---------------- */

/** An egg found this run, with the distance walked (px) when it was found; in co-op, every player's (`walked`, by slot). */
export type FoundEgg = { tier: EggTier; at: number; walked?: number[] }

/** `lucky`: this player never had an egg, so the next roll can't miss. `boost` multiplies every source's chance (Incense). */
export type RunEggs = { found: FoundEgg[]; lucky: boolean; boost: number }

/** Whether `source` leaves an egg, and which. Null on a miss or once the run's cap is reached. */
export const rollEgg = (rng: Rng, source: EggSource, eggs: RunEggs): EggTier | null => {
  if (eggs.found.length >= EGGS.perRun) return null
  const rule: DropRule = EGG_SOURCES[source]
  if (!eggs.lucky && !chance(rng, Math.min(1, rule.chance * eggs.boost))) return null
  return weightedPick(rng, EGG_TIER_IDS.flatMap((tier) => (rule.odds[tier] ? [[tier, rule.odds[tier]] as const] : [])))
}

export const toSteps = (px: number) => Math.floor(Math.max(0, px) / EGGS.stepPx)

/* ---------------- Incubator ---------------- */

/** An egg in the incubator: its tier and the steps it has walked so far. */
export type Egg = { tier: EggTier; steps: number }

/** Families hatched so far. A shiny hatch keeps the family shiny for good. */
export type Hatched = Partial<Record<HatchlingId, { shiny: boolean }>>

export const stepsLeft = (egg: Egg) => Math.max(0, EGG_TIERS[egg.tier].steps - egg.steps)

export const isReady = (egg: Egg) => stepsLeft(egg) === 0

const walk = (egg: Egg, steps: number): Egg => ({ tier: egg.tier, steps: Math.min(EGG_TIERS[egg.tier].steps, egg.steps + steps) })

/** Incubator slots still free. */
export const freeSlots = (eggs: readonly Egg[]) => Math.max(0, EGGS.slots - eggs.length)

/** The ₽ eggs of these tiers are paid out for when they don't fit. */
export const refundOf = (tiers: readonly EggTier[]) => tiers.reduce((sum, tier) => sum + EGG_TIERS[tier].refund, 0)

/**
 * Banks a run into the incubator: the eggs already in it walk `steps`, then
 * the new ones (with the steps they walked since found) take the free slots.
 * Those that don't fit are paid out in ₽.
 */
export const depositEggs = (save: Save, steps: number, found: readonly Egg[]) => {
  const free = freeSlots(save.eggs)
  const converted = found.slice(free).map((e) => e.tier)
  const refund = refundOf(converted)
  const eggs = [...save.eggs.map((e) => walk(e, steps)), ...found.slice(0, free).map((e) => walk(e, 0))]
  return { save: { ...save, eggs, wallet: save.wallet + refund }, converted, refund }
}

/** Gives an egg outside a run (mission rewards). It starts with no steps; a full incubator pays its ₽ instead. */
export const grantEgg = (save: Save, tier: EggTier) => depositEggs(save, 0, [{ tier, steps: 0 }])

/* ---------------- Hatching ---------------- */

export type Hatch = { id: HatchlingId; tier: EggTier; shiny: boolean; duplicate: boolean; refund: number }

/** Who can come out of an egg of `tier` (its `families`' when it borrows them), weighted towards families not hatched yet (all alike for an `even` tier). */
export const hatchPool = (tier: EggTier, hatched: Hatched) => {
  const rule: EggTierRule = EGG_TIERS[tier]
  const from = rule.families ?? tier
  return HATCHLING_IDS.filter((id) => HATCHLINGS[id].egg === from).map((id) => [id, hatched[id] || rule.even ? 1 : EGGS.newWeight] as const)
}

/** Whether an egg of `tier` always hatches shiny (the loyalty card's Kecleon Egg). */
export const hatchesShiny = (tier: EggTier) => {
  const rule: EggTierRule = EGG_TIERS[tier]
  return rule.shiny === true
}

/** Each family's share of an egg of `tier` for this save (what the shop shows): the weights of `hatchPool`, summing to 1. */
export const hatchOdds = (tier: EggTier, hatched: Hatched) => {
  const pool = hatchPool(tier, hatched)
  const total = pool.reduce((sum, [, w]) => sum + w, 0)
  return pool.map(([id, w]) => [id, w / total] as const)
}

/**
 * Hatches the ready egg at `index`. A new family, or the shiny form of one
 * owned in normal colors, unlocks it; anything else is a duplicate worth its
 * tier's ₽. Either way the Pokédex catches what came out (`markHatch`). Null
 * when there is no ready egg there.
 */
export const hatchEgg = (save: Save, index: number, rng: Rng): { save: Save; hatch: Hatch } | null => {
  const egg = save.eggs[index]
  if (!egg || !isReady(egg)) return null
  const id = weightedPick(rng, hatchPool(egg.tier, save.hatched))
  const shiny = chance(rng, EGGS.shinyOdds) || hatchesShiny(egg.tier)
  const owned = save.hatched[id]
  const duplicate = owned !== undefined && (owned.shiny || !shiny)
  const refund = duplicate ? EGG_TIERS[egg.tier].refund : 0
  return {
    save: {
      ...save,
      eggs: save.eggs.filter((_, i) => i !== index),
      hatched: duplicate ? save.hatched : { ...save.hatched, [id]: { shiny } },
      wallet: save.wallet + refund,
      dex: markHatch(save.dex, HATCHLINGS[id].line.map((stage) => stage.dex), shiny),
    },
    hatch: { id, tier: egg.tier, shiny, duplicate, refund },
  }
}

/** Starters are always playable; egg families once hatched. Legends aren't unlocked by eggs: the Legend mode captures them (the save's side). */
export const isUnlocked = (hatched: Hatched, id: PlayableId) => isStarter(id) || (isHatchling(id) && hatched[id] !== undefined)

/* ---------------- Save fields ---------------- */

/** Rarest first, then the most walked: the order eggs keep their slot in `mergeEggs`. */
const byValue = (x: Egg, y: Egg) => EGG_TIER_IDS.indexOf(y.tier) - EGG_TIER_IDS.indexOf(x.tier) || y.steps - x.steps

const ofTier = (list: readonly Egg[], tier: EggTier) => list.filter((e) => e.tier === tier).sort(byValue)

/**
 * Both incubators in one. Eggs have no identity, so each tier keeps as many
 * as the side with more of it, pairing the most walked with the most walked
 * (each pair keeps the larger step count). Merging the same incubator again
 * changes nothing. Past the slots, the rarest and most walked stay.
 */
export const mergeEggs = (a: readonly Egg[], b: readonly Egg[]): Egg[] =>
  EGG_TIER_IDS.flatMap((tier) => {
    const x = ofTier(a, tier)
    const y = ofTier(b, tier)
    return Array.from({ length: Math.max(x.length, y.length) }, (_, i) => ({ tier, steps: Math.max(x[i]?.steps ?? 0, y[i]?.steps ?? 0) }))
  })
    .sort(byValue)
    .slice(0, EGGS.slots)

/** Every family hatched on either side, shiny if it is shiny on either. */
export const mergeHatched = (a: Hatched, b: Hatched): Hatched =>
  Object.fromEntries(HATCHLING_IDS.flatMap((id) => (a[id] || b[id] ? [[id, { shiny: a[id]?.shiny === true || b[id]?.shiny === true }]] : [])))

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isTier = (v: unknown): v is EggTier => typeof v === 'string' && v in EGG_TIERS

/** The save's `eggs`: unknown tiers are dropped, steps clamped and the list cut to the slots. */
export const parseEggs = (v: unknown): Egg[] =>
  Array.isArray(v)
    ? v
        .flatMap((e) => (isRecord(e) && isTier(e.tier) ? [walk({ tier: e.tier, steps: 0 }, typeof e.steps === 'number' && e.steps > 0 ? Math.floor(e.steps) : 0)] : []))
        .slice(0, EGGS.slots)
    : []

/** The save's `hatched`: unknown families are dropped. */
export const parseHatched = (v: unknown): Hatched =>
  isRecord(v) ? Object.fromEntries(HATCHLING_IDS.flatMap((id) => { const h = v[id]; return isRecord(h) ? [[id, { shiny: h.shiny === true }]] : [] })) : {}
