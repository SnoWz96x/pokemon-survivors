import { dirTo, fromAngle } from '../engine/math'
import { chance, range } from '../engine/rng'
import * as dm from '../engine/dmath'
import { damageEnemy } from './combat'
import { burst, floatText, shakeScreen } from './effects'
import {
  ACCEL, ACE_REACH, BALL_LOB, bestLine, BRAVE, BUBBLE_SPREAD, COTTON, crossCrit, CROSS_CRIT_MULT, FALL_GAP, FALL_RISE, FALL_STEP,
  lastResortMult, nearSegment, recoilCost, RESORT_NEED, RESORT_WINDUP, ROCK_GAP, ROUGH, SPORE_R, waterfallMult, weatherBallForm, WILD, ZAP,
} from './eggMove2Rules'
import { boneHits, densestFoe } from './eggMoveRules'
import { modHit } from './mods'
import type { CastStats, Look, MoveDef, MoveId, MoveStats } from './moves'
import { isAlive, nearestEnemy } from './queries'
import { addMoveBuff } from './signatureMoves'
import { spawnAttack } from './spawn'
import { applyStatus, type StatusSpec } from './status'
import { ownAttack } from './players'
import type { Attack, Enemy, Game } from './types'
import { weatherHere } from './weather'

/**
 * The second batch of egg-family signature moves, each with a verb of its own:
 * a recoil dive through the longest line of foes, a ball that turns with the
 * weather, an instant rock dash, an orb that always paralyzes, slashes that
 * never miss, a cross that crits, a stream of bubbles, a burst of 2–5 rocks, a
 * cotton cloud, an electric charge that costs HP, a brawl that weakens, spores
 * that put foes to sleep, a waterfall that grows with evolution and a Last
 * Resort that needs a full kit. Spread at the end of `MOVES` (`moves.ts`); the
 * pure rules live in `eggMove2Rules.ts`, the art in `render/eggMove2Fx.ts`.
 *
 * Like `signatureMoves.ts`, this module must not use `moves.ts` at load time
 * (it is evaluated first), so its few cast helpers are its own.
 */

const stats = (s: Partial<MoveStats>): MoveStats => ({
  damage: 0, cooldown: 1, area: 1, amount: 1, speed: 0, duration: 1, pierce: Infinity, knockback: 0, statusChance: 0, statusDamage: 0, ...s,
})

const look = (move: MoveId, type: Look['type'], visual: Look['visual']): Look => ({ move, type, visual })

/** Lets the shell play the move's own sound (`ui/castSounds.ts`). */
const cast = (g: Game, move: MoveId) => g.events.push({ kind: 'cast', move })

/** Angles spread evenly around `center`, `step` radians apart. */
const fan = (center: number, count: number, step: number) =>
  Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * step)

/** Toward the nearest foe within `reach` (its body), else the way the player faces. */
const aimAngle = (g: Game, reach: number) => {
  const p = g.player
  const e = nearestEnemy(g, p.x, p.y, reach)
  const d = e ? dirTo(p.x, p.y - 8, e.x, e.y - e.radius, p.facing) : p.facing
  return dm.atan2(d.y, d.x)
}

/** Offset `dist` px towards `angle`, at body height, for strikes glued to the player. */
const reachOffset = (angle: number, dist: number) => {
  const d = fromAngle(angle, dist)
  return { ox: d.x, oy: d.y - 8 }
}

/** Living foes within `r` of (x, y), nearest first (ties to the lower id). */
const foesWithin = (g: Game, x: number, y: number, r: number) => {
  const out: Array<{ e: Enemy; d: number }> = []
  for (const e of g.enemies) {
    if (!isAlive(e)) continue
    const d = dm.sq(e.x - x) + dm.sq(e.y - y)
    if (d <= r * r) out.push({ e, d })
  }
  return out.sort((a, b) => a.d - b.d || a.e.id - b.e.id).map((o) => o.e)
}

/** Hits `e` with `a` right now (an instant strike), letting the branch mods hear of it like a regular hit. */
const strikeNow = (g: Game, a: Attack, e: Enemy) => {
  a.hits.set(e.id, Infinity)
  damageEnemy(g, e, a)
  if (a.mod) modHit(g, a, e)
}

/**
 * Takes `share` of max HP from the player for a hit of `a` (recoil), up to
 * `cap` per cast (`a.memo` keeps what it took), never the last HP point.
 */
const recoil = (g: Game, a: Attack, share: number, cap: number) => {
  const p = g.player
  const cost = recoilCost(p.stats.maxHp, p.hp, a.memo, share, cap)
  if (cost <= 0) return
  p.hp -= cost
  a.memo += cost
  floatText(g, p.x, p.y - 26, String(cost), '#f87858', true)
}

/** The player's speed without `move`'s own buff, so a refreshed buff never compounds. */
const ownSpeed = (g: Game, move: MoveId) => {
  const p = g.player
  const own = p.moveBuffs.find((b) => b.move === move && b.applied)
  return p.stats.speed - (own?.stats.speed ?? 0)
}

/** `spec` with the move's own status chance on top (Weather Ball's forms, Spore's extras). */
const withChance = (spec: StatusSpec, s: CastStats): StatusSpec => ({ ...spec, chance: Math.min(1, spec.chance + s.statusChance) })

/** The branch a fork path took at step `index` (`OwnedMove.path`, like `branchAt` in `moves.ts`). */
const took = (path: number, index: number) => (path >> index) & 1

const EFFECT_POISON = { kind: 'poison', chance: 1, duration: 4, power: 0.35 } as const satisfies StatusSpec
/** Heavy Spore's slow: lasts past the sleep, so the sleepers wake up sluggish. */
const HEAVY_SPORE = { kind: 'slow', chance: 1, duration: 5, power: 0.4 } as const satisfies StatusSpec
const DREAM_MARK = { kind: 'mark', chance: 1, duration: 4, power: 0.15 } as const satisfies StatusSpec

export const EGG_MOVES_2 = {
  /* ---------------- Starly: Brave Bird ---------------- */

  braveBird: {
    name: 'Brave Bird',
    type: 'flying',
    base: stats({ damage: 24, cooldown: 2.8, knockback: 90 }),
    upgrades: [
      { damage: 6 },
      { area: 0.2 },
      { fork: [{ stats: { damage: 6 }, mods: ['burstOnKill'] }, { stats: { cooldown: -0.3 }, mods: ['trail'] }] },
      { damage: 6 },
      { cooldown: -0.3 },
      { fork: [{ stats: { damage: 4 }, mods: ['arc'] }, { stats: { damage: -4 }, mods: ['echo'] }] },
      { damage: 8, area: 0.2 },
    ],
    // A dive along the line through the most foes, wrapped in fire-blue wings; every foe it hits costs a little HP.
    fire: (g, s) => {
      const p = g.player
      const target = bestLine(g.enemies, p, BRAVE.reach, BRAVE.length, BRAVE.width)
      if (!target) return
      const d = dirTo(p.x, p.y, target.x, target.y, p.facing)
      const v = BRAVE.length / BRAVE.time
      p.iframes = Math.max(p.iframes, BRAVE.time + 0.2)
      spawnAttack(g, {
        ...look('braveBird', 'flying', 'braveBird'), x: p.x, y: p.y - 8, from: { x: p.x, y: p.y },
        shape: { kind: 'circle', r: 13 * s.area }, motion: { kind: 'lunge', vx: d.x * v, vy: d.y * v, left: BRAVE.time },
        damage: s.damage, knockback: s.knockback, ttl: BRAVE.time + 0.22, activeUntil: BRAVE.time,
      })
      cast(g, 'braveBird')
    },
    onHit: (g, a) => {
      if (a.visual === 'braveBird') recoil(g, a, BRAVE.recoil, BRAVE.cap)
    },
  },

  /* ---------------- Budew: Weather Ball ---------------- */

  weatherBall: {
    name: 'Weather Ball',
    type: 'normal',
    base: stats({ damage: 13, cooldown: 1.7, amount: 1, knockback: 50 }),
    upgrades: [
      { damage: 4 },
      { amount: 1 },
      { fork: [{ stats: { damage: 4 }, mods: ['burstOnKill'] }, { stats: { area: 0.25 }, mods: ['trail'] }] },
      { cooldown: -0.25 },
      { damage: 4, area: 0.15 },
      { fork: [{ stats: { amount: 1 }, mods: ['hunter'] }, { stats: { damage: -3 }, mods: ['echo'] }] },
      { damage: 5, statusChance: 0.15 },
    ],
    // A ball lobbed at the nearest foes. Clear skies: Normal. Sun: Fire that burns. Rain: Water that slows.
    // Sand: Rock that weakens. Snow: Ice that may freeze. Under any weather it hits ×1.5.
    fire: (g, s) => {
      const p = g.player
      const form = weatherBallForm(weatherHere(g))
      const status = form.status && withChance(form.status, s)
      const taken = new Set<number>()
      for (let i = 0; i < s.amount; i++) {
        const t = nearestEnemy(g, p.x, p.y, 220, taken)
        if (t) taken.add(t.id)
        const ahead = fromAngle(dm.atan2(p.facing.y, p.facing.x) + (i - (s.amount - 1) / 2) * 0.5, 70)
        spawnAttack(g, {
          ...look('weatherBall', form.type, 'weatherBall'), x: t ? t.x : p.x + ahead.x, y: t ? t.y - t.radius : p.y + ahead.y - 8,
          shape: { kind: 'circle', r: 16 * s.area * form.burst }, motion: { kind: 'static' },
          damage: s.damage * form.mult, knockback: s.knockback, status,
          ttl: BALL_LOB + 0.34, activeFrom: BALL_LOB, activeUntil: BALL_LOB + 0.08,
          from: { x: p.x, y: p.y - 12 }, age: -i * 0.08, tier: form.form,
        })
      }
      cast(g, 'weatherBall')
    },
  },

  /* ---------------- Rockruff: Accelerock ---------------- */

  accelerock: {
    name: 'Accelerock',
    type: 'rock',
    base: stats({ damage: 8, cooldown: 0.7, amount: 1, knockback: 70 }),
    upgrades: [
      { damage: 2 },
      { cooldown: -0.08 },
      { fork: [{ stats: { damage: 1 }, mods: ['arc'] }, { stats: { damage: 3 }, mods: ['burstOnKill'] }] },
      { damage: 3 },
      { amount: 1 },
      { fork: [{ stats: { amount: 1, damage: -1 }, mods: ['cruel'] }, { stats: { cooldown: -0.06 }, mods: ['echo'] }] },
      { damage: 4, cooldown: -0.06 },
    ],
    // A blur of rock from the player to the nearest foe, at once, clipping whoever stands in the way.
    fire: (g, s) => {
      const p = g.player
      const taken = new Set<number>()
      const from = { x: p.x, y: p.y - 8 }
      for (let i = 0; i < s.amount; i++) {
        const t = nearestEnemy(g, p.x, p.y, ACCEL.reach, taken)
        if (!t) break
        taken.add(t.id)
        const to = { x: t.x, y: t.y - t.radius }
        const a = spawnAttack(g, {
          ...look('accelerock', 'rock', 'accelerock'), ...to, from,
          shape: { kind: 'circle', r: 8 * s.area }, motion: { kind: 'static' },
          damage: s.damage, knockback: s.knockback, ttl: 0.3, activeFrom: Infinity, flip: i % 2 === 1,
        })
        for (const e of g.enemies) {
          if (!isAlive(e) || a.hits.has(e.id)) continue
          if (e === t || nearSegment(e.x, e.y - e.radius, from, to, ACCEL.clip * s.area + e.radius)) strikeNow(g, a, e)
        }
      }
      if (taken.size > 0) cast(g, 'accelerock')
    },
  },

  /* ---------------- Grubbin: Zap Cannon ---------------- */

  zapCannon: {
    name: 'Zap Cannon',
    type: 'electric',
    base: stats({ damage: 12, cooldown: 3.2, amount: 1, speed: 70, knockback: 20 }),
    status: { kind: 'paralysis', chance: 1, duration: 1.6, power: 0 },
    upgrades: [
      { damage: 3 },
      { area: 0.2 },
      { fork: [{ stats: { damage: 2 }, mods: ['seek'] }, { stats: { area: 0.15 }, mods: ['trail'] }] },
      { cooldown: -0.4 },
      { damage: 4 },
      { fork: [{ stats: { damage: 2 }, mods: ['arc'] }, { stats: { amount: 1, damage: -3 }, mods: ['drain'] }] },
      { damage: 5, area: 0.2 },
    ],
    // A big, slow electric orb that drifts through the horde, zapping and always paralyzing what it crosses.
    fire: (g, s) => {
      const p = g.player
      for (const angle of fan(aimAngle(g, 260), s.amount, 0.5)) {
        const v = fromAngle(angle, s.speed)
        spawnAttack(g, {
          ...look('zapCannon', 'electric', 'zapCannon'), x: p.x, y: p.y - 10,
          shape: { kind: 'circle', r: ZAP.r * s.area }, motion: { kind: 'linear', vx: v.x, vy: v.y },
          damage: s.damage, knockback: s.knockback, hitInterval: ZAP.hitInterval, ttl: ZAP.ttl, status: s.status,
        })
      }
      cast(g, 'zapCannon')
    },
  },

  /* ---------------- Pidgey: Aerial Ace ---------------- */

  aerialAce: {
    name: 'Aerial Ace',
    type: 'flying',
    base: stats({ damage: 12, cooldown: 1.3, amount: 2, knockback: 40 }),
    tags: ['slice'],
    upgrades: [
      { damage: 3 },
      { amount: 1 },
      { fork: [{ stats: { amount: 1 }, mods: ['hunter'] }, { stats: { damage: 5 }, mods: ['burstOnKill'] }] },
      { cooldown: -0.2 },
      { damage: 4 },
      { fork: [{ stats: { damage: -3 }, mods: ['echo'] }, { stats: { damage: 2 }, mods: ['arc'] }] },
      { amount: 1, damage: 4 },
    ],
    // Swift wind slashes on the nearest foes: they never miss, cut through wards and land resisted matchups as neutral.
    fire: (g, s) => {
      const p = g.player
      const foes = foesWithin(g, p.x, p.y, ACE_REACH).slice(0, s.amount)
      foes.forEach((e, i) => {
        const a = spawnAttack(g, {
          ...look('aerialAce', 'flying', 'aerialAce'), x: e.x, y: e.y - e.radius,
          shape: { kind: 'circle', r: Math.max(8, e.radius) * s.area }, motion: { kind: 'tether', target: e, every: Infinity, next: Infinity },
          damage: s.damage, knockback: s.knockback, sure: true, ttl: 0.3, activeFrom: Infinity, flip: i % 2 === 1,
        })
        strikeNow(g, a, e)
      })
      if (foes.length > 0) cast(g, 'aerialAce')
    },
  },

  /* ---------------- Zubat: Cross Poison ---------------- */

  crossPoison: {
    name: 'Cross Poison',
    type: 'poison',
    base: stats({ damage: 16, cooldown: 1.4, amount: 1, knockback: 50 }),
    status: { kind: 'poison', chance: 0.4, duration: 3, power: 0.3 },
    tags: ['slice'],
    upgrades: [
      { damage: 4 },
      { statusChance: 0.15 },
      { fork: [{ stats: { statusChance: 0.2 }, mods: ['trail'] }, { stats: { damage: 6 }, mods: ['burstOnKill'] }] },
      { area: 0.2 },
      { amount: 1 },
      { fork: [{ stats: { damage: -3 }, mods: ['echo'] }, { stats: { area: 0.2 }, mods: ['arc'] }] },
      { damage: 6, statusDamage: 0.3 },
    ],
    // Two venom blades cross in an X at the nearest foe. One in four is a critical hit: ×2, and the screen feels it.
    fire: (g, s) => {
      const p = g.player
      const aim = aimAngle(g, 90)
      for (let i = 0; i < s.amount; i++) {
        const crit = crossCrit(g.rng())
        const angle = aim + (i === 0 ? 0 : (i % 2 === 1 ? 1 : -1) * 0.7 * Math.ceil(i / 2))
        const off = reachOffset(angle, 18 * s.area)
        spawnAttack(g, {
          ...look('crossPoison', 'poison', 'crossPoison'), x: p.x + off.ox, y: p.y + off.oy,
          shape: { kind: 'circle', r: 17 * s.area }, motion: { kind: 'follow', ...off },
          damage: s.damage * (crit ? CROSS_CRIT_MULT : 1), knockback: s.knockback * (crit ? 1.6 : 1), status: s.status,
          ttl: 0.3, activeUntil: 0.1, age: -i * 0.12, tier: crit ? 1 : 0,
        })
      }
      cast(g, 'crossPoison')
    },
    onHit: (g, a) => {
      if (a.visual !== 'crossPoison' || a.tier !== 1 || a.hits.size !== 1) return
      shakeScreen(g, 3)
      g.hitstop = Math.max(g.hitstop, 0.04)
    },
  },

  /* ---------------- Poliwag: Bubble Beam ---------------- */

  bubbleBeam: {
    name: 'Bubble Beam',
    type: 'water',
    base: stats({ damage: 7, cooldown: 1.5, amount: 6, speed: 175, pierce: 1, knockback: 25 }),
    status: { kind: 'slow', chance: 1, duration: 1.2, power: 0.35 },
    upgrades: [
      { amount: 2 },
      { damage: 2 },
      { fork: [{ stats: { damage: -1 }, mods: ['split'] }, { stats: { speed: -30 }, mods: ['seek'] }] },
      { amount: 2 },
      { damage: 2, area: 0.2 },
      { fork: [{ stats: { damage: 1 }, mods: ['bounce'] }, { stats: { cooldown: 0.1 }, mods: ['rear'] }] },
      { amount: 3, damage: 1 },
    ],
    // A stream of bubbles at the nearest foe (the first ones fastest, so they string out), each slowing what it pops on.
    fire: (g, s) => {
      const p = g.player
      const aim = aimAngle(g, 240)
      for (let i = 0; i < s.amount; i++) {
        const angle = aim + range(g.rng, -BUBBLE_SPREAD, BUBBLE_SPREAD) * (i === 0 ? 0 : 1)
        const v = fromAngle(angle, s.speed * (1 - (i / Math.max(1, s.amount)) * 0.45))
        spawnAttack(g, {
          ...look('bubbleBeam', 'water', 'bubbleBeam'), x: p.x, y: p.y - 8,
          shape: { kind: 'circle', r: (3 + (i % 3)) * s.area }, motion: { kind: 'linear', vx: v.x, vy: v.y },
          damage: s.damage, knockback: s.knockback, pierce: s.pierce, ttl: 1.25 + range(g.rng, 0, 0.25), status: s.status,
          age: -i * 0.025, flip: i % 2 === 1,
        })
      }
      cast(g, 'bubbleBeam')
    },
  },

  /* ---------------- Roggenrola: Rock Blast ---------------- */

  rockBlast: {
    name: 'Rock Blast',
    type: 'rock',
    base: stats({ damage: 11, cooldown: 1.6, amount: 1, speed: 240, pierce: 1, knockback: 60 }),
    upgrades: [
      { damage: 3 },
      { cooldown: -0.15 },
      { fork: [{ stats: { damage: -2 }, mods: ['split'] }, { stats: { damage: 3 }, mods: ['bounce'] }] },
      { amount: 1 },
      { damage: 4, area: 0.15 },
      { fork: [{ stats: { damage: 2 }, mods: ['burstOnKill'] }, { stats: { speed: -40 }, mods: ['seek'] }] },
      { amount: 1, damage: 4 },
    ],
    // A burst of 2 to 5 rocks (rolled each cast, more with upgrades) fired one after another at the nearest foe.
    fire: (g, s) => {
      const p = g.player
      const count = boneHits(g.rng()) + s.amount - 1
      const aim = aimAngle(g, 260)
      for (let i = 0; i < count; i++) {
        const v = fromAngle(aim + range(g.rng, -0.09, 0.09), s.speed * (1 - i * 0.05))
        spawnAttack(g, {
          ...look('rockBlast', 'rock', 'rockBlast'), x: p.x, y: p.y - 8,
          shape: { kind: 'circle', r: 5 * s.area }, motion: { kind: 'linear', vx: v.x, vy: v.y },
          damage: s.damage, knockback: s.knockback, pierce: s.pierce, ttl: 1.3, age: -i * ROCK_GAP, flip: i % 2 === 1, tier: count,
        })
      }
      cast(g, 'rockBlast')
    },
  },

  /* ---------------- Mareep: Cotton Spore ---------------- */

  cottonSpore: {
    name: 'Cotton Spore',
    type: 'grass',
    base: stats({ damage: 3, cooldown: 4.5, amount: 1, duration: 3 }),
    status: { kind: 'slow', chance: 1, duration: 0.7, power: 0.65 },
    upgrades: [
      { area: 0.2 },
      { duration: 1 },
      { fork: [{ stats: { damage: 2 }, mods: ['echo'] }, { stats: { damage: 3 }, mods: ['arc'] }] },
      { cooldown: -0.6 },
      { area: 0.2, damage: 2 },
      { fork: [{ stats: { amount: 1 }, mods: ['vortex'] }, { stats: { area: 0.3, damage: 2 }, mods: ['burstOnKill'] }] },
      { duration: 1.5, damage: 2 },
    ],
    // A fluffy cotton cloud drifts onto the thickest crowd and sits there: the foes inside slow to a crawl.
    fire: (g, s) => {
      const p = g.player
      const placed: Array<{ x: number; y: number }> = []
      for (let i = 0; i < s.amount; i++) {
        const free = g.enemies.filter((e) => placed.every((c) => dm.sq(e.x - c.x) + dm.sq(e.y - c.y) > dm.sq(COTTON.r * 2 * s.area)))
        const t = densestFoe(free, p, COTTON.reach, COTTON.crowd)
        const ahead = fromAngle(dm.atan2(p.facing.y, p.facing.x) + i * 2.1, 60)
        const at = t ? { x: t.x, y: t.y } : { x: p.x + ahead.x, y: p.y + ahead.y }
        placed.push(at)
        spawnAttack(g, {
          ...look('cottonSpore', 'grass', 'cottonSpore'), x: at.x, y: at.y - 6, from: { x: p.x, y: p.y - 14 },
          shape: { kind: 'circle', r: COTTON.r * s.area }, motion: { kind: 'static' },
          damage: s.damage, hitInterval: COTTON.hitInterval, ttl: s.duration + 0.3, activeFrom: 0.3, status: s.status, age: -i * 0.1,
        })
      }
      cast(g, 'cottonSpore')
    },
  },

  /* ---------------- Shinx: Wild Charge ---------------- */

  wildCharge: {
    name: 'Wild Charge',
    type: 'electric',
    base: stats({ damage: 18, cooldown: 4.2, duration: 1.8, knockback: 80 }),
    status: { kind: 'paralysis', chance: 0.25, duration: 1, power: 0 },
    upgrades: [
      { damage: 4 },
      { duration: 0.4 },
      { fork: [{ stats: { damage: 1 }, mods: ['trail'] }, { stats: { damage: 4 }, mods: ['burstOnKill'] }] },
      { cooldown: -0.5 },
      { damage: 5, statusChance: 0.1 },
      { fork: [{ stats: { duration: 0.6 }, mods: ['drain'] }, { stats: { damage: 2 }, mods: ['arc'] }] },
      { damage: 6, area: 0.2 },
    ],
    // Crackling with electricity, the player runs faster and their body shocks every foe they touch; each shock costs a little HP.
    fire: (g, s) => {
      const p = g.player
      const live = g.attacks.find((a) => ownAttack(g, a) && a.visual === 'wildCharge')
      if (live) {
        live.ttl = live.age + s.duration
        live.damage = s.damage
        live.status = s.status
      } else {
        spawnAttack(g, {
          ...look('wildCharge', 'electric', 'wildCharge'), x: p.x, y: p.y - 8,
          shape: { kind: 'circle', r: 16 * s.area }, motion: { kind: 'follow', ox: 0, oy: -8 },
          damage: s.damage, knockback: s.knockback, hitInterval: WILD.hitInterval, ttl: s.duration, status: s.status,
        })
      }
      addMoveBuff(g, 'wildCharge', s.duration, { speed: ownSpeed(g, 'wildCharge') * WILD.haste })
      burst(g, p.x, p.y - 8, { colors: ['#fff8a0', '#f8d030', '#ffffff'], count: 10, speed: 90, ttl: 0.3 })
      cast(g, 'wildCharge')
    },
    onHit: (g, a) => {
      if (a.visual === 'wildCharge') recoil(g, a, WILD.recoil, WILD.cap)
    },
  },

  /* ---------------- Azurill: Play Rough ---------------- */

  playRough: {
    name: 'Play Rough',
    type: 'fairy',
    base: stats({ damage: 10, cooldown: 2.4, amount: 1, knockback: 30 }),
    status: { kind: 'weaken', chance: 0.6, duration: 3, power: 0.3 },
    upgrades: [
      { damage: 2 },
      { area: 0.2 },
      { fork: [{ stats: { amount: 1 }, mods: ['cruel'] }, { stats: { damage: 2 }, mods: ['burstOnKill'] }] },
      { cooldown: -0.3 },
      { damage: 3 },
      { fork: [{ stats: { damage: -1 }, mods: ['echo'] }, { stats: { statusChance: 0.25, area: 0.2 }, mods: ['vortex'] }] },
      { amount: 1, damage: 2 },
    ],
    // A cartoon brawl cloud bursts on the nearest foe (stars, fists, a heart): rapid hits that leave foes weakened.
    fire: (g, s) => {
      const p = g.player
      const taken = new Set<number>()
      for (let i = 0; i < s.amount; i++) {
        const t = nearestEnemy(g, p.x, p.y, ROUGH.reach, taken)
        if (!t) break
        taken.add(t.id)
        spawnAttack(g, {
          ...look('playRough', 'fairy', 'playRough'), x: t.x, y: t.y - t.radius,
          shape: { kind: 'circle', r: ROUGH.r * s.area }, motion: { kind: 'static' },
          damage: s.damage, knockback: s.knockback, hitInterval: ROUGH.hitInterval, ttl: ROUGH.ttl, status: s.status, age: -i * 0.1,
        })
      }
      if (taken.size > 0) cast(g, 'playRough')
    },
  },

  /* ---------------- Shroomish: Spore ---------------- */

  spore: {
    name: 'Spore',
    type: 'grass',
    base: stats({ damage: 8, cooldown: 6, duration: 2.5 }),
    status: { kind: 'sleep', chance: 0.85, duration: 2.5, power: 0 },
    upgrades: [
      { area: 0.2 },
      { statusChance: 0.1 },
      { fork: [{ stats: {} }, { stats: { area: 0.3 } }] },
      { duration: 0.5 },
      { cooldown: -0.8 },
      { fork: [{ stats: { cooldown: -0.4 }, mods: ['echo'] }, { stats: {} }] },
      { area: 0.2, duration: 0.5 },
    ],
    // A puff of spores around the player puts the foes in it to sleep (no damage, so they stay asleep until another move hits).
    // Effect Spore also poisons them, Heavy Spore leaves them slow after waking; Dream Dust marks them to take more from that hit.
    fire: (g, s, owned) => {
      const p = g.player
      const r = SPORE_R * s.area
      spawnAttack(g, {
        ...look('spore', 'grass', 'spore'), x: p.x, y: p.y - 6,
        shape: { kind: 'circle', r }, motion: { kind: 'follow', ox: 0, oy: -6 }, damage: 0, ttl: 0.9, activeFrom: Infinity,
      })
      const path = owned.path ?? 0
      const sleep = s.status && { ...s.status, duration: s.duration }
      const poison = took(path, 2) === 0 && owned.level >= 4
      const numb = took(path, 2) === 1 && owned.level >= 4
      const mark = took(path, 5) === 1 && owned.level >= 7
      for (const e of foesWithin(g, p.x, p.y, r + 6)) {
        if (!sleep || !chance(g.rng, sleep.chance)) continue
        applyStatus(e.status, sleep, s.damage, e.boss, 'spore', g.player.slot)
        if (poison) applyStatus(e.status, EFFECT_POISON, s.damage, e.boss, 'spore', g.player.slot)
        if (numb) applyStatus(e.status, HEAVY_SPORE, s.damage, e.boss, 'spore', g.player.slot)
        if (mark) applyStatus(e.status, DREAM_MARK, s.damage, e.boss, 'spore', g.player.slot)
      }
      cast(g, 'spore')
    },
  },

  /* ---------------- Magikarp: Waterfall ---------------- */

  waterfall: {
    name: 'Waterfall',
    type: 'water',
    base: stats({ damage: 18, cooldown: 2.1, amount: 4, knockback: 70 }),
    status: { kind: 'sleep', chance: 1, duration: 0.5, power: 0 },
    upgrades: [
      { damage: 4 },
      { amount: 1 },
      { fork: [{ stats: { amount: 2 }, mods: ['hunter'] }, { stats: { damage: 5 }, mods: ['burstOnKill'] }] },
      { cooldown: -0.3 },
      { damage: 5, area: 0.15 },
      { fork: [{ stats: { damage: -3 }, mods: ['echo'] }, { stats: { area: 0.2 }, mods: ['arc'] }] },
      { damage: 7, amount: 1 },
    ],
    // Pillars of water burst up one after another in a line at the nearest foe, making what they hit flinch.
    // A splash as Magikarp; once it evolves, a torrent (`waterfallMult`).
    fire: (g, s) => {
      const p = g.player
      const mult = waterfallMult(p.stage)
      const d = fromAngle(aimAngle(g, 200))
      for (let i = 0; i < s.amount; i++) {
        const dist = 22 + i * FALL_GAP * Math.max(1, s.area * 0.9)
        spawnAttack(g, {
          ...look('waterfall', 'water', 'waterfall'), x: p.x + d.x * dist, y: p.y + d.y * dist,
          shape: { kind: 'circle', r: 11 * s.area }, motion: { kind: 'static' },
          damage: s.damage * mult, knockback: s.knockback, status: s.status,
          ttl: FALL_RISE + 0.42, activeFrom: FALL_RISE * 0.6, activeUntil: FALL_RISE + 0.08, age: -i * FALL_STEP, tier: mult > 1 ? 1 : 0,
          flip: i % 2 === 1,
        })
      }
      cast(g, 'waterfall')
    },
  },

  /* ---------------- Eevee: Last Resort ---------------- */

  lastResort: {
    name: 'Last Resort',
    type: 'normal',
    base: stats({ damage: 36, cooldown: 3.8, knockback: 200 }),
    upgrades: [
      { damage: 8 },
      { area: 0.2 },
      { fork: [{ stats: { damage: 10 }, mods: ['hunter'] }, { stats: { area: 0.3 }, mods: ['burstOnKill'] }] },
      { cooldown: -0.4 },
      { damage: 10 },
      { fork: [{ stats: { cooldown: -0.3 }, mods: ['execute'] }, { stats: { damage: -8 }, mods: ['echo'] }] },
      { damage: 12, area: 0.2 },
    ],
    // A colossal star slam on the nearest foe, at full power only with 4 other moves learned (a tap before that).
    fire: (g, s) => {
      const p = g.player
      const others = p.moves.filter((m) => m.id !== 'lastResort').length
      const ready = others >= RESORT_NEED
      const t = nearestEnemy(g, p.x, p.y, 170)
      const ahead = fromAngle(dm.atan2(p.facing.y, p.facing.x), 40)
      spawnAttack(g, {
        ...look('lastResort', 'normal', 'lastResort'), x: t ? t.x : p.x + ahead.x, y: t ? t.y - t.radius : p.y + ahead.y - 8,
        from: { x: p.x, y: p.y - 10 },
        shape: { kind: 'circle', r: (ready ? 30 : 12) * s.area }, motion: { kind: 'static' },
        damage: s.damage * lastResortMult(others), knockback: s.knockback * (ready ? 1 : 0.3),
        ttl: RESORT_WINDUP + 0.55, activeFrom: RESORT_WINDUP, activeUntil: RESORT_WINDUP + 0.07, tier: ready ? 1 : 0,
      })
      cast(g, 'lastResort')
    },
    onHit: (g, a) => {
      if (a.visual !== 'lastResort' || a.tier !== 1 || a.hits.size !== 1) return
      shakeScreen(g, 6)
      g.hitstop = Math.max(g.hitstop, 0.07)
      g.events.push({ kind: 'quake' })
    },
  },
} as const satisfies Record<string, MoveDef>

/** Ids of this batch, in table order (`ps.sig()` lists them). */
export const EGG_MOVE_2_IDS = Object.keys(EGG_MOVES_2) as Array<keyof typeof EGG_MOVES_2>
