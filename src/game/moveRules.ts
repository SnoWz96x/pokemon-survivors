import * as dm from '../engine/dmath'

/**
 * Pure rules behind the lunge, chain, mine and turret moves (`moves.ts` casts
 * them, `attacks.ts` runs mines and turrets). Kept free of game state so the
 * numbers that keep them fair can be tested on their own.
 */

/* ---------------- Lunge (Quick Attack, Extreme Speed) ---------------- */

/** A lunge never comes back sooner than this, whatever the upgrades and items. */
export const LUNGE_MIN_COOLDOWN = 1.5
/** Seconds the lunge carries the player. */
export const LUNGE_TIME = 0.14
/** Invulnerable seconds from the start of a lunge: the dash plus a short landing. Always under the cooldown floor. */
export const LUNGE_IFRAMES = 0.3
/** Hard cap on the lunge length, so speed items can't fling the player across the screen. */
export const LUNGE_MAX = 84
/** How far past its target a lunge may carry the player. */
export const LUNGE_OVERSHOOT = 14
/** Extra reach when looking for a target, beyond the lunge length. */
export const LUNGE_SEEK = 24
/** While walking, only foes within this cone (cosine of the half-angle, 60°) of the stick count. */
export const LUNGE_CONE = 0.5

type Point = { x: number; y: number }
type Foe = { id: number; x: number; y: number; dying: number }

/** Lunge length in px for a move `speed` (px/s), before it stops short at its target. */
export const lungeLength = (speed: number) => Math.min(LUNGE_MAX, speed * LUNGE_TIME)

/**
 * The foe a lunge goes for: the nearest living one within `reach`. While the
 * player walks (`moving`), only foes roughly ahead of the stick count, so the
 * lunge never yanks the player against the joystick. Ties go to the lower id.
 */
export const lungeTarget = <T extends Foe>(foes: readonly T[], from: Point, facing: Point, moving: boolean, reach: number): T | null => {
  let best: T | null = null
  let bestD = reach * reach
  for (const e of foes) {
    if (e.dying >= 0) continue
    const dx = e.x - from.x
    const dy = e.y - from.y
    const d = dm.sq(dx) + dm.sq(dy)
    if (d > bestD || (d === bestD && best && e.id > best.id)) continue
    if (moving && d > 0 && dx * facing.x + dy * facing.y < LUNGE_CONE * dm.hypot(dx, dy)) continue
    best = e
    bestD = d
  }
  return best
}

/**
 * One tick of a lunge carrying its caster (`Motion` 'lunge': Quick Attack,
 * Brave Bird, Zen Headbutt…): the move in px and the seconds left after it.
 * Pure, so the simulation (`attacks.ts`) and co-op's prediction ghost
 * (`coop/predict.ts`) move the player by the same bits.
 */
export const lungeStep = (m: { vx: number; vy: number; left: number }, dt: number) => {
  const step = Math.min(dt, m.left)
  return { dx: m.vx * step, dy: m.vy * step, left: m.left - step }
}

/** One tick of a roll (Rollout): `speed` px/s the way the player faces, on top of the walk. Pure, like `lungeStep`. */
export const rollStep = (facing: Point, speed: number, dt: number) => ({ dx: facing.x * speed * dt, dy: facing.y * speed * dt })

/* ---------------- Chain (Shock Wave, Thunderbolt, Hex) ---------------- */

/** The first foe must be this close to the player. */
export const CHAIN_RANGE = 200
/** Each jump reaches this far from the last foe hit (scaled by area). */
export const CHAIN_JUMP = 90
/** Damage multiplier per jump. */
export const CHAIN_FALLOFF = 0.85
/** Hex hits foes with a status condition this much harder (an `afflicted` bonus, `kitRules.ts`). */
export const HEX_BONUS = 1.7

/**
 * Up to `count` foes, in hit order: the nearest to `from` within `range`, then
 * each next nearest unhit foe within `jump` of the last one. Ties go to the
 * lower id, so the order is the same on every engine.
 */
export const chainTargets = <T extends Foe>(foes: readonly T[], from: Point, count: number, range: number, jump: number): T[] => {
  const hit: T[] = []
  let at = from
  let reach = range
  while (hit.length < count) {
    let best: T | null = null
    let bestD = reach * reach
    for (const e of foes) {
      if (e.dying >= 0 || hit.includes(e)) continue
      const d = dm.sq(e.x - at.x) + dm.sq(e.y - at.y)
      if (d > bestD || (d === bestD && best && e.id > best.id)) continue
      best = e
      bestD = d
    }
    if (!best) break
    hit.push(best)
    at = best
    reach = jump
  }
  return hit
}

/** Damage of the `hop`-th hit (0 = first): ×0.85 per jump. A bonus (Hex) applies on the hit (`Attack.bonus`). */
export const chainDamage = (damage: number, hop: number) => damage * dm.pow(CHAIN_FALLOFF, hop)

/* ---------------- Mines (Toxic Spikes, Barb Barrage) ---------------- */

/** Seconds before a fresh mine can go off. */
export const MINE_ARM = 0.35
/** A mine that expires untouched still blows, for this share of its damage. */
export const MINE_EXPIRED = 0.5

/** Mines one move may have out at once: 4, plus 2 per extra mine a cast drops. */
export const mineCap = (amount: number) => 4 + 2 * Math.max(0, amount - 1)

export const mineArmed = (age: number) => age >= MINE_ARM

/** Blast damage: full when a foe steps on it, half when it runs out. */
export const mineBlast = (damage: number, expired: boolean) => (expired ? damage * MINE_EXPIRED : damage)

/* ---------------- Turrets (Will-O-Wisp, Inferno) ---------------- */

/** A turret only shoots at foes this close to it. */
export const TURRET_RANGE = 160
