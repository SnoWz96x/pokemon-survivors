import { dirTo, fromAngle, TAU } from '../engine/math'
import { chance, pick, range } from '../engine/rng'
import { query } from '../engine/spatial'
import type { PokeType } from '../data/types'
import { damageEnemy } from './combat'
import { burst, shakeScreen } from './effects'
import { chainDamage, mineCap } from './moveRules'
import { enemiesInView, isAlive, nearestEnemy } from './queries'
import { spawnAttack } from './spawn'
import type { StatusSpec } from './status'
import { forkTargets, siblingStatus, TRI_ELEMENTS } from './evolvedRules'
import { ownAttack } from './players'
import type { Attack, Enemy, Game, Visual } from './types'
import type { CastStats, MoveId } from './moves'
import * as dm from '../engine/dmath'

/**
 * Casts of the evolved moves that changed form when they evolve (Tri Attack's
 * beams, Surf's waves, Power Whip's spin…), plus the two hooks `attacks.ts`
 * calls for them: `evolvedTick` every tick (trails, Leaf Storm's spread,
 * Hurricane's pull) and `evolvedImpact` once, when a hitbox lands (screen
 * shake, debris, the toxic cloud a barb leaves). Everything runs on the
 * seeded rng and `dmath`, like the rest of the simulation.
 */

type Look = { move: MoveId; type: PokeType; visual: Visual }

const fan = (center: number, count: number, step: number) =>
  Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * step)

/** Angle to the nearest foe within `reach`, or the way the player faces. */
const aimAt = (g: Game, reach: number) => {
  const p = g.player
  const t = nearestEnemy(g, p.x, p.y, reach)
  const d = t ? dirTo(p.x, p.y, t.x, t.y) : p.facing
  return dm.atan2(d.y, d.x)
}

/** Up to `count` distinct foes around (x, y), nearest first. */
const nearestFoes = (g: Game, x: number, y: number, reach: number, count: number) => {
  const taken = new Set<number>()
  const out: Enemy[] = []
  while (out.length < count) {
    const e = nearestEnemy(g, x, y, reach, taken)
    if (!e) break
    taken.add(e.id)
    out.push(e)
  }
  return out
}

/** Visual-only attacks: drawn, never hit (the prism, the storm cloud, the snow swirl). */
const ornament = (g: Game, look: Look, ttl: number, oy: number, age = 0) =>
  spawnAttack(g, {
    ...look, x: g.player.x, y: g.player.y + oy,
    shape: { kind: 'circle', r: 1 }, motion: { kind: 'follow', ox: 0, oy }, damage: 0, ttl, activeFrom: Infinity, age,
  })

/** Keeps one ornament of a kind alive while the move keeps casting, instead of stacking them. */
const keepOrnament = (g: Game, look: Look, ttl: number, oy: number) => {
  const live = g.attacks.find((a) => ownAttack(g, a) && a.visual === look.visual && a.move === look.move)
  if (live) live.ttl = Math.max(live.ttl, live.age + ttl)
  else ornament(g, look, ttl, oy)
}

/* ---------------- Beams (Tri Attack, Hydro Pump) ---------------- */

/** Px/s a beam lights up at, from its origin outwards. */
export const BEAM_SWEEP = 1100
/** Gap between a beam's hit segments, px. */
export const BEAM_STEP = 8

type BeamInit = { damage: number; knockback: number; status: StatusSpec | null; r: number; hold: number; age: number }

/**
 * A straight beam from (x, y) along `angle`, `len` px long: segments light up
 * outwards at `BEAM_SWEEP` px/s, glow for `hold` s and fade. They share one
 * `hits` map, so each foe is hit once per beam. A visual-only flash marks the
 * far end the moment the beam gets there.
 */
const beam = (g: Game, look: Look, x: number, y: number, angle: number, len: number, b: BeamInit) => {
  const d = fromAngle(angle)
  const hits = new Map<number, number>()
  for (let dist = 6; dist <= len; dist += BEAM_STEP) {
    const at = dist / BEAM_SWEEP
    spawnAttack(g, {
      ...look, x: x + d.x * dist, y: y + d.y * dist, from: { x, y },
      shape: { kind: 'circle', r: b.r }, motion: { kind: 'static' },
      damage: b.damage, knockback: b.knockback, status: b.status, hits,
      activeFrom: at, activeUntil: at + 0.05, ttl: at + b.hold, age: b.age,
    })
  }
  spawnAttack(g, {
    ...look, x: x + d.x * len, y: y + d.y * len, from: { x, y },
    shape: { kind: 'circle', r: b.r * 2 }, motion: { kind: 'static' }, damage: 0, status: b.status,
    activeFrom: Infinity, ttl: 0.22, age: b.age - len / BEAM_SWEEP,
  })
}

/** Tri Attack: a spinning prism over the player fires fire, ice and lightning beams at the nearest foes. */
export const castTriAttack = (g: Game, s: CastStats) => {
  const p = g.player
  const ox = p.x
  const oy = p.y - 30
  const foes = nearestFoes(g, ox, oy, 210, s.amount)
  const spread = fan(aimAt(g, 210), s.amount, 0.42)
  ornament(g, { move: 'triAttack', type: 'normal', visual: 'triPrism' }, 0.55, -30)
  for (let i = 0; i < s.amount; i++) {
    const t = foes[i]
    const angle = t ? dm.atan2(t.y - t.radius - oy, t.x - ox) : spread[i]!
    const el = TRI_ELEMENTS[i % 3]!
    beam(g, { move: 'triAttack', type: 'normal', visual: el.visual }, ox, oy, angle, 160 * s.area, {
      damage: s.damage, knockback: s.knockback, status: siblingStatus(s.status, TRI_ELEMENTS[0].status, el.status),
      r: 4 * s.area, hold: 0.28, age: -0.12 - i * 0.06,
    })
  }
}

/** Hydro Pump: twin pressurized beams the way the player faces; each ends in a splash that knocks foes back. */
export const castHydroPump = (g: Game, s: CastStats) => {
  const p = g.player
  const facing = dm.atan2(p.facing.y, p.facing.x)
  const len = 175 * s.area
  fan(facing, s.amount, 0.16).forEach((angle, i) => {
    const side = fromAngle(angle + Math.PI / 2, (i - (s.amount - 1) / 2) * 5)
    const ox = p.x + side.x
    const oy = p.y - 8 + side.y
    beam(g, { move: 'hydroPump', type: 'water', visual: 'hydroPump' }, ox, oy, angle, len, {
      damage: s.damage, knockback: s.knockback, status: null, r: 6 * s.area, hold: 0.3, age: -i * 0.04,
    })
    const end = fromAngle(angle, len)
    spawnAttack(g, {
      move: 'hydroPump', type: 'water', visual: 'pumpSplash', x: ox + end.x, y: oy + end.y,
      shape: { kind: 'circle', r: 16 * s.area }, motion: { kind: 'static' },
      damage: s.damage * 0.6, knockback: s.knockback, activeFrom: len / BEAM_SWEEP, activeUntil: len / BEAM_SWEEP + 0.06,
      ttl: len / BEAM_SWEEP + 0.4, age: -i * 0.04,
    })
  })
}

/* ---------------- Waves (Surf) ---------------- */

/** Hit segments across one Surf wave; the middle one paints the whole crest. */
const WAVE_SEGMENTS = 7
const WAVE_SPEED = 230
/** Px a Surf wave spans across, and how far its middle bows ahead of its ends, at area 1. */
export const WAVE_WIDTH = 104
export const WAVE_BOW = 9

/**
 * Surf: `amount` big waves roll out from the player, the first the way it
 * faces and the others evenly around, each a curved crest that sweeps
 * everything in its band once (shared `hits`), pushing and slowing.
 */
export const castSurf = (g: Game, s: CastStats) => {
  const p = g.player
  const facing = dm.atan2(p.facing.y, p.facing.x)
  const width = WAVE_WIDTH * s.area
  const gap = width / (WAVE_SEGMENTS - 1)
  for (let w = 0; w < s.amount; w++) {
    const angle = facing + (w * TAU) / s.amount
    const d = fromAngle(angle)
    const hits = new Map<number, number>()
    for (let k = 0; k < WAVE_SEGMENTS; k++) {
      const f = k / (WAVE_SEGMENTS - 1) - 0.5
      // The crest bows forward in the middle.
      const ahead = 10 + (1 - 4 * f * f) * WAVE_BOW * s.area
      spawnAttack(g, {
        move: 'surf', type: 'water', visual: k === (WAVE_SEGMENTS - 1) / 2 ? 'surf' : 'hitbox',
        x: p.x + d.x * ahead - d.y * f * width, y: p.y - 6 + d.y * ahead + d.x * f * width,
        shape: { kind: 'circle', r: gap * 0.75 }, motion: { kind: 'linear', vx: d.x * WAVE_SPEED, vy: d.y * WAVE_SPEED },
        damage: s.damage, knockback: s.knockback, status: s.status, hits, ttl: s.duration,
        age: -w * 0.1,
      })
    }
  }
}

/* ---------------- Spinning lash (Power Whip) ---------------- */

const VINE_SEGMENTS = 5
/** Seconds one lash takes to sweep its half circle. */
export const LASH_TIME = 0.24

/**
 * Power Whip: `amount` thorny vines spin out around the player, each sweeping
 * half a circle from the nearest foe's side, hitting every foe on its way
 * once. The outermost segment paints the whole vine; the rest are bare hitboxes.
 */
export const castPowerWhip = (g: Game, s: CastStats) => {
  const p = g.player
  const aim = aimAt(g, 140)
  const reach = 72 * s.area
  const spin = (p.facing.x < 0 ? -1 : 1) * (Math.PI / LASH_TIME)
  for (let v = 0; v < s.amount; v++) {
    const start = aim + (v * TAU) / s.amount - (Math.sign(spin) * Math.PI) / 2
    const hits = new Map<number, number>()
    for (let k = 1; k <= VINE_SEGMENTS; k++) {
      spawnAttack(g, {
        move: 'powerWhip', type: 'grass', visual: k === VINE_SEGMENTS ? 'powerWhip' : 'hitbox', x: p.x, y: p.y,
        shape: { kind: 'circle', r: 9 * s.area }, motion: { kind: 'orbit', angle: start, spin, radius: (reach * k) / VINE_SEGMENTS },
        damage: s.damage, knockback: s.knockback, hits, activeUntil: LASH_TIME, ttl: LASH_TIME + 0.14, age: -v * 0.06,
      })
    }
  }
}

/* ---------------- Storms (Wildbolt Storm, Blizzard, Leaf Storm) ---------------- */

/** Seconds a Wildbolt bolt takes to fall from the storm cloud. */
const BOLT_FALL = 0.2

/**
 * Wildbolt Storm: a storm cloud gathers over the player and rains bolts on
 * foes all over the screen; each bolt forks into the two nearest foes around
 * the one it struck, for half its damage.
 */
export const castWildboltStorm = (g: Game, s: CastStats) => {
  const targets = enemiesInView(g)
  if (targets.length === 0) return
  keepOrnament(g, { move: 'wildboltStorm', type: 'electric', visual: 'stormCloud' }, 1.4, -62)
  for (let i = 0; i < s.amount; i++) {
    const t = pick(g.rng, targets)
    const age = -i * 0.08
    spawnAttack(g, {
      move: 'wildboltStorm', type: 'electric', visual: 'wildbolt', x: t.x, y: t.y,
      shape: { kind: 'circle', r: 16 * s.area }, motion: { kind: 'static' },
      damage: s.damage, knockback: s.knockback, ttl: 0.55, activeFrom: BOLT_FALL, activeUntil: BOLT_FALL + 0.08, status: s.status, age,
    })
    const from = { x: t.x, y: t.y - t.radius }
    for (const f of nearestFoes(g, t.x, t.y, 60 * s.area, 3).filter((e) => e !== t).slice(0, 2)) {
      spawnAttack(g, {
        move: 'wildboltStorm', type: 'electric', visual: 'wildFork', x: f.x, y: f.y - f.radius, from,
        shape: { kind: 'circle', r: 8 }, motion: { kind: 'static' },
        damage: s.damage * 0.5, status: s.status, activeFrom: BOLT_FALL + 0.04, activeUntil: BOLT_FALL + 0.1, ttl: BOLT_FALL + 0.3, age,
      })
    }
  }
  g.events.push({ kind: 'thunder' })
}

/** Seconds a Blizzard icicle takes to come down (its shadow is the warning). */
export const ICICLE_FALL = 0.38

/**
 * Blizzard: snow whirls around the player while `amount` icicles crash down
 * on foes nearby (or around, with none in reach). Each impact hurts and
 * chills, and the icicle stays stuck in the ground for `duration`, chilling
 * whatever wades through it.
 */
export const castBlizzard = (g: Game, s: CastStats) => {
  const p = g.player
  const near = enemiesInView(g).filter((e) => dm.sq(e.x - p.x) + dm.sq(e.y - p.y) < 150 * 150)
  keepOrnament(g, { move: 'blizzard', type: 'ice', visual: 'snowSwirl' }, 1.6, -8)
  for (let i = 0; i < s.amount; i++) {
    const off = fromAngle(range(g.rng, 0, TAU), range(g.rng, 30, 110))
    const t = near.length > 0 ? pick(g.rng, near) : { x: p.x + off.x, y: p.y + off.y * 0.7 }
    const x = t.x + range(g.rng, -6, 6)
    const y = t.y + range(g.rng, -4, 4)
    const age = -i * 0.07
    spawnAttack(g, {
      move: 'blizzard', type: 'ice', visual: 'icicleFall', x, y,
      shape: { kind: 'circle', r: 13 * s.area }, motion: { kind: 'static' },
      damage: s.damage, knockback: s.knockback, status: s.status,
      activeFrom: ICICLE_FALL, activeUntil: ICICLE_FALL + 0.06, ttl: ICICLE_FALL + 0.3, age, flip: chance(g.rng, 0.5),
    })
    spawnAttack(g, {
      move: 'blizzard', type: 'ice', visual: 'blizzard', x, y,
      shape: { kind: 'circle', r: 7 * s.area }, motion: { kind: 'static' },
      damage: s.damage * 0.35, status: s.status, hitInterval: 0.6,
      activeFrom: ICICLE_FALL + 0.12, ttl: ICICLE_FALL + s.duration, age,
    })
  }
}

/** Px/s a Leaf Storm leaf drifts outwards per px of its own radius (6 px at area 1). */
const LEAF_SPREAD = 12

/**
 * Leaf Storm: two spiral arms of leaves whirl around the player and widen
 * into a storm (`evolvedTick` grows their orbit), cutting whatever they cross.
 */
export const castLeafStorm = (g: Game, s: CastStats) => {
  const base = g.time * 1.3
  for (let i = 0; i < s.amount; i++) {
    const k = i >> 1
    spawnAttack(g, {
      move: 'leafStorm', type: 'grass', visual: 'leafStorm', x: g.player.x, y: g.player.y,
      shape: { kind: 'circle', r: 6 * s.area }, motion: { kind: 'orbit', angle: base + (i % 2) * Math.PI + k * 0.55, spin: s.speed / 70, radius: 12 },
      damage: s.damage, knockback: s.knockback, hitInterval: 0.45, ttl: s.duration, age: -k * 0.06, flip: i % 3 === 0,
    })
  }
}

/* ---------------- Lobbed bombs (Fire Blast, Gunk Shot) ---------------- */

/** Seconds a Fire Blast fireball flies before it bursts. */
export const BLAST_FLIGHT = 0.42
/** Flames in each of the five arms of Fire Blast's star. */
const STAR_FLAMES = 2

/**
 * Fire Blast: lobs `amount` big fireballs at the nearest foes. Each bursts
 * into the move's five-armed star of fire, which keeps burning on the ground
 * for `duration`.
 */
export const castFireBlast = (g: Game, s: CastStats) => {
  const p = g.player
  const foes = nearestFoes(g, p.x, p.y, 230, s.amount)
  const aim = aimAt(g, 230)
  for (let i = 0; i < s.amount; i++) {
    const t = foes[i]
    const spot = t ? { x: t.x, y: t.y } : { x: p.x + dm.cos(aim + i * 1.3) * 90, y: p.y + dm.sin(aim + i * 1.3) * 70 }
    const age = -i * 0.12
    spawnAttack(g, {
      move: 'fireBlast', type: 'fire', visual: 'fireBlast', x: spot.x, y: spot.y, from: { x: p.x, y: p.y - 10 },
      shape: { kind: 'circle', r: 22 * s.area }, motion: { kind: 'static' },
      damage: s.damage, knockback: s.knockback, status: s.status,
      activeFrom: BLAST_FLIGHT, activeUntil: BLAST_FLIGHT + 0.06, ttl: BLAST_FLIGHT + 0.32, age,
    })
    for (let arm = 0; arm < 5; arm++) {
      const d = fromAngle(-Math.PI / 2 + (arm * TAU) / 5)
      for (let j = 1; j <= STAR_FLAMES; j++) {
        const dist = j * 15 * s.area
        spawnAttack(g, {
          move: 'fireBlast', type: 'fire', visual: 'starFlame', x: spot.x + d.x * dist, y: spot.y + d.y * dist * 0.8,
          shape: { kind: 'circle', r: 8 * s.area }, motion: { kind: 'static' },
          damage: s.damage * 0.5, status: s.status, hitInterval: 0.5,
          activeFrom: BLAST_FLIGHT + j * 0.035, ttl: BLAST_FLIGHT + s.duration, age, flip: (arm + j) % 2 === 0,
        })
      }
    }
  }
}

/** Seconds a Gunk Shot bomb flies, and then its splatter. */
export const GUNK_FLIGHT = 0.5
export const SPLAT_FLIGHT = 0.26
const SPLATS = 3

/**
 * Gunk Shot: hurls `amount` heaps of garbage at foes nearby. Each lands with
 * a heavy splash (×2.5 damage) and splatters into four blobs that leave
 * poison puddles around it for `duration`.
 */
export const castGunkShot = (g: Game, s: CastStats) => {
  const p = g.player
  const nearby = enemiesInView(g).filter((e) => dm.sq(e.x - p.x) + dm.sq(e.y - p.y) < 170 * 170)
  for (let i = 0; i < s.amount; i++) {
    const t = nearby.length > 0 ? pick(g.rng, nearby) : { x: p.x + range(g.rng, -100, 100), y: p.y + range(g.rng, -70, 70) }
    const age = -i * 0.15
    spawnAttack(g, {
      move: 'gunkShot', type: 'poison', visual: 'gunkBomb', x: t.x, y: t.y, from: { x: p.x, y: p.y - 10 },
      shape: { kind: 'circle', r: 20 * s.area }, motion: { kind: 'static' },
      damage: s.damage * 2.5, knockback: 90, status: s.status,
      activeFrom: GUNK_FLIGHT, activeUntil: GUNK_FLIGHT + 0.06, ttl: GUNK_FLIGHT + 0.3, age,
    })
    const spin = range(g.rng, 0, TAU)
    for (let k = 0; k < SPLATS; k++) {
      const d = fromAngle(spin + (k * TAU) / SPLATS + range(g.rng, -0.4, 0.4), range(g.rng, 26, 50) * s.area)
      spawnAttack(g, {
        move: 'gunkShot', type: 'poison', visual: 'gunk', x: t.x + d.x, y: t.y + d.y * 0.7, from: { x: t.x, y: t.y },
        shape: { kind: 'circle', r: 12 * s.area }, motion: { kind: 'static' },
        damage: s.damage, hitInterval: 0.45, status: s.status,
        activeFrom: SPLAT_FLIGHT, ttl: SPLAT_FLIGHT + s.duration, age: age - GUNK_FLIGHT,
      })
    }
  }
}

/* ---------------- The rest ---------------- */

/**
 * Flamethrower: a roaring jet of fire at the nearest foe; where it ends, the
 * ground catches fire for `duration`.
 */
export const castFlamethrower = (g: Game, s: CastStats) => {
  const p = g.player
  const angle = aimAt(g, 300)
  for (let i = 0; i < s.amount; i++) {
    const v = fromAngle(angle + range(g.rng, -0.14, 0.14), s.speed * range(g.rng, 0.9, 1.1))
    spawnAttack(g, {
      move: 'flamethrower', type: 'fire', visual: 'flamethrower', x: p.x, y: p.y - 6,
      shape: { kind: 'circle', r: 4 * s.area }, motion: { kind: 'linear', vx: v.x, vy: v.y },
      damage: s.damage, knockback: s.knockback, ttl: 0.75, grow: 10 * s.area, status: s.status, age: -i * 0.05,
    })
  }
  const end = fromAngle(angle, s.speed * 0.62)
  spawnAttack(g, {
    move: 'flamethrower', type: 'fire', visual: 'flameField', x: p.x + end.x, y: p.y + end.y,
    shape: { kind: 'circle', r: 14 * s.area }, motion: { kind: 'static' },
    damage: s.damage * 0.25, status: s.status, hitInterval: 0.5, activeFrom: 0.3, ttl: 0.3 + s.duration,
  })
}

/**
 * Barb Barrage: flings `amount` barbs all around; they skid to a stop and
 * become mines (`attacks.ts` arms and blows them), and each blast leaves a
 * toxic cloud (`evolvedImpact`). Over the mine cap the oldest go off early.
 */
export const castBarbBarrage = (g: Game, s: CastStats) => {
  const p = g.player
  const mines: Attack[] = []
  for (const a of g.attacks) if (ownAttack(g, a) && a.move === 'barbBarrage' && a.blast > 0 && a.pierce > 0) mines.push(a)
  const extra = mines.length + s.amount - mineCap(s.amount)
  for (let i = 0; i < extra && i < mines.length; i++) mines[i]!.ttl = mines[i]!.age
  const spin = g.time * 1.3
  for (let i = 0; i < s.amount; i++) {
    const v = fromAngle(spin + (i * TAU) / s.amount, range(g.rng, 130, 175))
    spawnAttack(g, {
      move: 'barbBarrage', type: 'poison', visual: 'barbs', x: p.x, y: p.y - 4,
      shape: { kind: 'circle', r: 9 * s.area }, motion: { kind: 'drift', vx: v.x, vy: v.y * 0.75, drag: 3.2 },
      damage: s.damage, knockback: s.knockback, pierce: 1, status: s.status, ttl: s.duration,
      blast: 30 * s.area, blastVisual: 'barbsBlast', flip: chance(g.rng, 0.5),
    })
  }
}

/**
 * Inferno: a bonfire at the player's feet that shoots `amount` fireballs at
 * the nearest foe every 0.45 s (a turret, see `attacks.ts`) inside a ring of
 * fire that burns whatever walks in, for `duration`.
 */
export const castInferno = (g: Game, s: CastStats) => {
  const p = g.player
  spawnAttack(g, {
    move: 'inferno', type: 'fire', visual: 'inferno', x: p.x, y: p.y + 2,
    shape: { kind: 'circle', r: 6 * s.area }, motion: { kind: 'static' },
    damage: s.damage, knockback: s.knockback, status: s.status, ttl: s.duration, activeFrom: Infinity,
    turret: { every: 0.45, left: 0.25, amount: s.amount, speed: s.speed, shot: 'infernoShot' },
  })
  spawnAttack(g, {
    move: 'inferno', type: 'fire', visual: 'infernoRing', x: p.x, y: p.y + 2,
    shape: { kind: 'circle', r: 30 * s.area }, motion: { kind: 'static' },
    damage: s.damage * 0.35, status: s.status, hitInterval: 0.5, ttl: s.duration,
  })
}

/**
 * Megahorn: `amount` huge horns drill out towards the nearest foe and come
 * back through the player like boomerangs, hitting on the way out and back.
 */
export const castMegahorn = (g: Game, s: CastStats) => {
  const p = g.player
  fan(aimAt(g, 260), s.amount, 0.38).forEach((angle, i) => {
    const d = fromAngle(angle)
    spawnAttack(g, {
      move: 'megahorn', type: 'bug', visual: 'megahorn', x: p.x, y: p.y - 8,
      shape: { kind: 'circle', r: 8 * s.area },
      motion: { kind: 'boomerang', vx: d.x * s.speed, vy: d.y * s.speed, ax: -d.x * s.speed * 1.5, ay: -d.y * s.speed * 1.5 },
      damage: s.damage, knockback: s.knockback, hitInterval: 0.5, ttl: 1.5, status: s.status, age: -i * 0.08,
    })
  })
}

/** Seconds between Outrage's breaths, and the roar after the last one. */
export const RAGE_BEAT = 0.16

/**
 * Outrage: a rampage of `amount` breaths at the nearest foe, thrashing side
 * to side and wider each time, ended by a roar that blasts the foes around
 * the player away.
 */
export const castOutrage = (g: Game, s: CastStats) => {
  const p = g.player
  const aim = aimAt(g, 200)
  for (let b = 0; b < s.amount; b++) {
    const angle = aim + (b === s.amount - 1 ? 0 : (b % 2 === 0 ? -1 : 1) * 0.3)
    const puffs = Math.min(9, 3 + 2 * b)
    fan(angle, puffs, 0.18).forEach((a, i) => {
      const v = fromAngle(a + range(g.rng, -0.08, 0.08), s.speed * range(g.rng, 0.6, 1.1))
      spawnAttack(g, {
        move: 'outrage', type: 'dragon', visual: 'outrage', x: p.x, y: p.y - 8,
        shape: { kind: 'circle', r: 3 * s.area }, motion: { kind: 'linear', vx: v.x, vy: v.y },
        damage: s.damage, knockback: s.knockback, ttl: 0.45, grow: 14 * s.area, status: s.status,
        age: -b * RAGE_BEAT - Math.abs(i - (puffs - 1) / 2) * 0.03,
      })
    })
  }
  spawnAttack(g, {
    move: 'outrage', type: 'dragon', visual: 'outrageRoar', x: p.x, y: p.y - 6,
    shape: { kind: 'circle', r: 8 }, motion: { kind: 'follow', ox: 0, oy: -6 },
    damage: s.damage * 1.2, knockback: 220, status: s.status, ttl: 0.32, grow: (64 * s.area) / 0.32, age: -s.amount * RAGE_BEAT,
  })
}

/* ---------------- Thunderbolt's forking current ---------------- */

/** Thunderbolt's first jump reaches this far from the player; each fork this far (scaled by area). */
const BOLT_RANGE = 200
const BOLT_JUMP = 80

/**
 * Thunderbolt: a bolt strikes the nearest foe from the sky and the current
 * forks from foe to foe, two ways at each one (`forkTargets`), ×0.85 damage
 * per jump. Hits land at once; the arcs show a beat apart per jump.
 */
export const castThunderbolt = (g: Game, s: CastStats) => {
  const p = g.player
  const forks = forkTargets(g.enemies, p, s.amount, BOLT_RANGE, BOLT_JUMP * s.area)
  forks.forEach(({ foe, parent, depth }) => {
    const to = { x: foe.x, y: foe.y - foe.radius }
    const src = forks[parent]?.foe
    const arc = spawnAttack(g, {
      move: 'thunderbolt', type: 'electric', visual: src ? 'thunderbolt' : 'boltStrike', ...to,
      from: src ? { x: src.x, y: src.y - src.radius } : { x: to.x, y: to.y - 160 },
      shape: { kind: 'circle', r: 4 * s.area }, motion: { kind: 'static' },
      damage: chainDamage(s.damage, depth), status: s.status, ttl: 0.3, activeFrom: Infinity, age: -depth * 0.045,
    })
    damageEnemy(g, foe, arc)
  })
}

/* ---------------- Hooks (`attacks.ts`) ---------------- */

const neighbors: number[] = []

/** Hurricane drags the foes near each funnel into it (bosses barely budge). */
const pull = (g: Game, a: Attack, r: number, dt: number) => {
  for (const i of query(g.grid, a.x, a.y, r * 2.4, neighbors)) {
    const e = g.enemies[i]
    if (!e || !isAlive(e)) continue
    const d = dirTo(e.x, e.y - e.radius, a.x, a.y)
    const k = (170 * dt) / e.mass
    e.kx += d.x * k
    e.ky += d.y * k
  }
}

type Emit = { speed?: number; gravity?: number; ttl?: number; spread?: number }

const emit = (g: Game, at: { x: number; y: number }, colors: readonly string[], p: number, o: Emit = {}) => {
  if (!chance(g.rng, p)) return
  const spread = o.spread ?? 2
  g.particles.push({
    x: at.x + range(g.rng, -spread, spread), y: at.y + range(g.rng, -spread, spread),
    vx: range(g.rng, -1, 1) * (o.speed ?? 10), vy: range(g.rng, -1, 1) * (o.speed ?? 10),
    life: 0, ttl: o.ttl ?? 0.3, color: pick(g.rng, colors), size: 1, gravity: o.gravity ?? 0, drag: 3,
  })
}

/** Where a lobbed attack is along its flight, from `from` to its spot, arcing `height` px (`k` 0..1 of the way). */
export const lobPoint = (a: Attack, height: number) => {
  const k = Math.max(0, Math.min(1, a.age / a.activeFrom))
  return { x: a.from.x + (a.x - a.from.x) * k, y: a.from.y + (a.y - a.from.y) * k - dm.sin(k * Math.PI) * height, k }
}

/** Arc heights of the lobbed attacks, shared with their art. */
export const LOB = { fireBlast: 60, gunkBomb: 54, gunk: 16 } as const

/** Per-tick behavior and trails of the evolved forms, after the attack moved. */
export const evolvedTick = (g: Game, a: Attack, dt: number) => {
  const m = a.motion
  switch (a.visual) {
    case 'leafStorm':
      if (m.kind === 'orbit' && a.shape.kind === 'circle') m.radius += LEAF_SPREAD * a.shape.r * dt
      return emit(g, a, ['#70d048', '#e0f8a0', '#a8e870'], 0.25, { ttl: 0.3 })
    case 'hurricane':
      if (a.shape.kind === 'circle') pull(g, a, a.shape.r, dt)
      return
    case 'surf': {
      if (m.kind !== 'linear' || a.shape.kind !== 'circle') return
      // Spray off the crest, anywhere along its width.
      const across = range(g.rng, -0.5, 0.5) * a.shape.r * 8
      const k = dm.hypot(m.vx, m.vy) || 1
      const at = { x: a.x - (m.vy / k) * across, y: a.y + (m.vx / k) * across }
      return emit(g, at, ['#ffffff', '#e0f8ff', '#a8d8f8'], 0.9, { speed: 30, gravity: 60, ttl: 0.35, spread: 2 })
    }
    case 'hydroPump':
    case 'triFire':
    case 'triIce':
    case 'triBolt': {
      if (a.age < a.activeFrom || a.activeFrom === Infinity) return
      const colors = a.visual === 'hydroPump' ? ['#ffffff', '#a8d8f8'] : a.visual === 'triFire' ? ['#ffd080', '#f06020'] : a.visual === 'triIce' ? ['#e0f8ff', '#60c0f0'] : ['#fff8c0', '#f8d830']
      return emit(g, a, colors, 0.12, { speed: 26, gravity: a.visual === 'hydroPump' ? 70 : 0, ttl: 0.25 })
    }
    case 'flameField':
    case 'starFlame':
    case 'infernoRing':
      if (a.age < a.activeFrom) return
      return emit(g, a, ['#f8d030', '#f08030', '#c03020'], a.visual === 'infernoRing' ? 0.6 : 0.3, { gravity: -45, ttl: 0.45, spread: a.shape.kind === 'circle' ? a.shape.r * 0.8 : 4 })
    case 'toxicCloud':
      return emit(g, a, ['#c890d8', '#a040a0', '#88a038'], 0.4, { gravity: -18, ttl: 0.6, spread: a.shape.kind === 'circle' ? a.shape.r * 0.7 : 4 })
    case 'fireBlast':
      return a.age < a.activeFrom ? emit(g, lobPoint(a, LOB.fireBlast), ['#fff8c0', '#f8d030', '#f08030', '#c03020'], 1, { gravity: -40, ttl: 0.4, spread: 4 }) : undefined
    case 'gunkBomb':
      return a.age < a.activeFrom ? emit(g, lobPoint(a, LOB.gunkBomb), ['#6a3a78', '#88a038', '#281830'], 0.6, { gravity: 60, ttl: 0.35, spread: 3 }) : undefined
    case 'snowSwirl':
      return emit(g, a, ['#ffffff', '#e0f8ff'], 0.5, { speed: 30, gravity: 14, ttl: 0.6, spread: 40 })
  }
}

/** Once, when a hitbox lands (the tick its damage window opens, or its first visible tick for ornaments). */
export const evolvedImpact = (g: Game, a: Attack) => {
  switch (a.visual) {
    case 'wildbolt':
      shakeScreen(g, 2.5)
      return burst(g, a.x, a.y - 4, { colors: ['#ffffff', '#fff8a0', '#58c8f8'], count: 10, speed: 110, ttl: 0.3 })
    case 'fireBlast':
      shakeScreen(g, 3.5)
      return burst(g, a.x, a.y - 4, { colors: ['#fff8c0', '#f8d030', '#f08030', '#c03020'], count: 26, speed: 150, ttl: 0.5, gravity: -40 })
    case 'gunkBomb':
      shakeScreen(g, 3)
      return burst(g, a.x, a.y - 4, { colors: ['#281830', '#6a3a78', '#b878c8', '#88a038'], count: 22, speed: 120, ttl: 0.5, gravity: 120 })
    case 'icicleFall':
      shakeScreen(g, 1.5)
      return burst(g, a.x, a.y - 3, { colors: ['#ffffff', '#d8f0ff', '#98d8f8'], count: 9, speed: 90, ttl: 0.35, gravity: 160 })
    case 'pumpSplash':
      return burst(g, a.x, a.y, { colors: ['#ffffff', '#a8d8f8', '#4878e8'], count: 16, speed: 110, ttl: 0.4, gravity: 180 })
    case 'outrageRoar':
      shakeScreen(g, 4)
      return burst(g, a.x, a.y, { colors: ['#a070f8', '#f85030', '#f8d030'], count: 24, speed: 160, ttl: 0.4 })
    case 'stoneEdge':
      return burst(g, a.x, a.y, { colors: ['#d8c080', '#a08048', '#685028'], count: 4, speed: 70, ttl: 0.35, gravity: 220 })
    case 'extremeSpeed':
      if (a.motion.kind !== 'static') return
      shakeScreen(g, 2.5)
      return burst(g, a.x, a.y, { colors: ['#ffffff', '#f8d030', '#c89000'], count: 18, speed: 150, ttl: 0.35 })
    case 'boltStrike':
      shakeScreen(g, 2)
      return burst(g, a.x, a.y, { colors: ['#ffffff', '#fff8a0', '#f8b830'], count: 10, speed: 100, ttl: 0.3 })
    case 'barbsBlast':
      if (a.move !== 'barbBarrage' || a.shape.kind !== 'circle') return
      spawnAttack(g, {
        move: a.move, type: a.type, visual: 'toxicCloud', x: a.x, y: a.y,
        shape: { kind: 'circle', r: a.shape.r * 0.55 }, motion: { kind: 'static' },
        damage: a.damage * 0.12, status: a.status, hitInterval: 0.5, ttl: 1.6,
      })
      return
  }
}
