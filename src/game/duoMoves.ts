import { fromAngle, TAU } from '../engine/math'
import { range } from '../engine/rng'
import * as dm from '../engine/dmath'
import { damageEnemy } from './combat'
import type { DamageBonus } from './kitRules'
import { modHit } from './mods'
import { CHAIN_JUMP, CHAIN_RANGE, chainDamage, chainTargets } from './moveRules'
import type { CastStats, Look, MoveDef, MoveId, MoveStats } from './moves'
import { clusterSpots } from './moveVerbRules'
import { isAlive } from './queries'
import { addMoveBuff } from './signatureMoves'
import { spawnAttack } from './spawn'
import { ownAttack } from './players'
import type { Attack, Enemy, Game } from './types'
import { weatherHere } from './weather'
import { shakeScreen } from './effects'

/**
 * Duo moves: two maxed moves of a recipe's types fused into one (`duoRules.ts`
 * holds the recipes). The capstone of a run, so each is a show: a sea of fire,
 * a rainbow over the field, a swamp that drags the horde, a comet, puddles that
 * conduct, a freezing mist, a nightmare that hexes twice. They are spread at
 * the end of `MOVES` (`moves.ts`), flagged `duo`, and never evolve; they grow
 * Lv1–5 like evolved moves. Their per-tick bits (a comet's impact) run in
 * `updateDuos`, their art in `render/duoFx.ts`.
 *
 * This module must not import `moves.ts` at runtime (it is evaluated while
 * `MOVES` is built), so the helpers it needs are its own.
 */

const stats = (s: Partial<MoveStats>): MoveStats => ({
  damage: 0, cooldown: 1, area: 1, amount: 1, speed: 0, duration: 1, pierce: Infinity, knockback: 0, statusChance: 0, statusDamage: 0, ...s,
})

const look = (move: MoveId, type: Look['type'], visual: Look['visual']): Look => ({ move, type, visual })

/** Lets the shell play the move's own sound (`ui/castSfx.ts`). */
const cast = (g: Game, move: MoveId) => g.events.push({ kind: 'cast', move })

/** Living foes within `reach` of the player. */
const near = (g: Game, reach: number) => {
  const p = g.player
  return g.enemies.filter((e) => isAlive(e) && dm.sq(e.x - p.x) + dm.sq(e.y - p.y) <= reach * reach)
}

/* ---------------- Fire Pledge: a sea of fire ---------------- */

/** Fire Pledge's ring of pillars (× area) and the sea of fire inside it. */
export const SEA_OF_FIRE = { ring: 44, pillar: 10, r: 56, share: 0.4, hitInterval: 0.5 } as const

/* ---------------- Water Pledge: a rainbow ---------------- */

/** Status chance the rainbow adds to every move while it shines (canon: secondary effects twice as likely). */
export const RAINBOW_CHANCE = 0.25
/** Geysers' reach for the crowds, their size (× area) and the warning before they burst. */
export const GEYSER = { reach: 220, r: 13, rise: 0.22 } as const

/* ---------------- Grass Pledge: a swamp ---------------- */

/** The swamp around the player (× area): its size, its tick and its share of the pillars' damage. */
export const SWAMP = { r: 72, hitInterval: 0.6, share: 0.2, pillar: 11 } as const

/* ---------------- Fusion Flare / Fusion Bolt: a fused comet ---------------- */

/** Seconds a comet falls, how far off it starts (up and to the left), its blast and scorch (× area). */
export const COMET = { fall: 0.6, dx: -56, dy: -118, r: 26, scorch: 22, share: 0.15, gap: 0.22 } as const

/* ---------------- Ion Deluge: conducting puddles ---------------- */

/** Puddles land on foes within `reach`; `max` live at once (the oldest dry up); `rain` adds one per cast. */
export const ION = { reach: 180, r: 16, hitInterval: 0.6, max: 12 } as const

/* ---------------- Freeze-Dry: a freezing mist ---------------- */

/** How far the mist rolls out (× area); rings `gap` s apart. */
export const FREEZE_DRY = { r: 78, gap: 0.3 } as const
/** Freeze-Dry hits frozen foes harder (canon: it's super effective even on Water). */
const FROZEN_BONUS: readonly DamageBonus[] = [{ when: 'frozen', mult: 1.4 }]

/* ---------------- Nightmare: a Hex, twice ---------------- */

/** Afflicted foes take ×2, poisoned ones ×1.5 more: a Hex doubled. The skull bites again `echo` s later. */
export const NIGHTMARE_BONUS: readonly DamageBonus[] = [{ when: 'afflicted', mult: 2 }, { when: 'poisoned', mult: 1.5 }]
export const NIGHTMARE_ECHO = 0.32

/** A fused comet (Flare burns, Bolt paralyzes) on each of the thickest crowds, leaving a scorched patch. */
const comet = (g: Game, s: CastStats, l: Look) => {
  const p = g.player
  const spots = clusterSpots(near(g, 240), s.amount, 34)
  if (spots.length === 0) spots.push({ x: p.x + p.facing.x * 80, y: p.y + p.facing.y * 80 })
  spots.forEach((pt, i) => {
    const delay = i * COMET.gap
    spawnAttack(g, {
      ...l, visual: 'comet', x: pt.x, y: pt.y,
      shape: { kind: 'circle', r: COMET.r * s.area }, motion: { kind: 'static' },
      damage: s.damage, knockback: s.knockback, status: s.status,
      ttl: COMET.fall + 0.4, activeFrom: COMET.fall, activeUntil: COMET.fall + 0.08,
      from: { x: pt.x + COMET.dx, y: pt.y + COMET.dy }, age: -delay,
    })
    spawnAttack(g, {
      ...l, visual: 'cometScorch', x: pt.x, y: pt.y,
      shape: { kind: 'circle', r: COMET.scorch * s.area }, motion: { kind: 'static' },
      damage: s.damage * COMET.share, status: s.status, hitInterval: 0.5, ttl: s.duration, age: -(delay + COMET.fall),
    })
  })
  cast(g, l.move)
}

export const DUO_MOVES = {
  firePledge: {
    name: 'Fire Pledge',
    type: 'fire',
    duo: true,
    base: stats({ damage: 48, cooldown: 2.6, amount: 8, duration: 3, knockback: 70 }),
    status: { kind: 'burn', chance: 0.5, duration: 3, power: 0.35 },
    upgrades: [{ amount: 2, damage: 10 }, { duration: 1, area: 0.15 }, { damage: 16, statusDamage: 0.25 }, { cooldown: -0.4, amount: 2 }],
    // Pillars of fire burst in a ring around the player, and the ground inside burns on as a sea of fire.
    fire: (g, s) => {
      const p = g.player
      const turn = range(g.rng, 0, TAU)
      const l = look('firePledge', 'fire', 'pledgePillar')
      for (let i = 0; i < s.amount; i++) {
        const at = fromAngle(turn + (i / s.amount) * TAU, SEA_OF_FIRE.ring * s.area)
        spawnAttack(g, {
          ...l, x: p.x + at.x, y: p.y + at.y,
          shape: { kind: 'circle', r: SEA_OF_FIRE.pillar * s.area }, motion: { kind: 'static' },
          damage: s.damage, knockback: s.knockback, status: s.status,
          ttl: 0.6, activeFrom: 0.05, activeUntil: 0.22, age: -i * 0.03,
        })
      }
      spawnAttack(g, {
        ...l, visual: 'seaOfFire', x: p.x, y: p.y,
        shape: { kind: 'circle', r: SEA_OF_FIRE.r * s.area }, motion: { kind: 'static' },
        damage: s.damage * SEA_OF_FIRE.share, status: s.status, hitInterval: SEA_OF_FIRE.hitInterval, ttl: s.duration, activeFrom: 0.25,
      })
      cast(g, 'firePledge')
    },
  },

  waterPledge: {
    name: 'Water Pledge',
    type: 'water',
    duo: true,
    base: stats({ damage: 54, cooldown: 2, amount: 4, duration: 2.6, knockback: 230 }),
    upgrades: [{ amount: 1, damage: 10 }, { duration: 1.2 }, { area: 0.25, damage: 12 }, { cooldown: -0.35, amount: 2 }],
    // Geysers burst under the thickest crowds, and a rainbow shines over the field:
    // while it lasts, every move is likelier to inflict its condition.
    fire: (g, s) => {
      const p = g.player
      const spots = clusterSpots(near(g, GEYSER.reach), s.amount, 26)
      while (spots.length < s.amount) {
        const at = fromAngle(range(g.rng, 0, TAU), range(g.rng, 40, 100))
        spots.push({ x: p.x + at.x, y: p.y + at.y })
      }
      spots.forEach((pt, i) => {
        spawnAttack(g, {
          ...look('waterPledge', 'water', 'pledgePillar'), x: pt.x, y: pt.y,
          shape: { kind: 'circle', r: GEYSER.r * s.area }, motion: { kind: 'static' },
          damage: s.damage, knockback: s.knockback,
          ttl: GEYSER.rise + 0.55, activeFrom: GEYSER.rise, activeUntil: GEYSER.rise + 0.12, age: -i * 0.07,
        })
      })
      addMoveBuff(g, 'waterPledge', s.duration, { statusChance: RAINBOW_CHANCE })
      cast(g, 'waterPledge')
    },
  },

  grassPledge: {
    name: 'Grass Pledge',
    type: 'grass',
    duo: true,
    base: stats({ damage: 38, cooldown: 1.6, amount: 3, knockback: 30 }),
    status: { kind: 'slow', chance: 1, duration: 1, power: 0.55 },
    upgrades: [{ amount: 1, damage: 7 }, { area: 0.2 }, { damage: 10 }, { cooldown: -0.3, amount: 2 }],
    // A swamp spreads around the player and walks with them, bogging down every foe in it,
    // while pillars of vines burst under the ones it holds.
    fire: (g, s) => {
      const p = g.player
      const r = SWAMP.r * s.area
      const l = look('grassPledge', 'grass', 'pledgePillar')
      const swamp = g.attacks.find((a) => ownAttack(g, a) && a.move === 'grassPledge' && a.visual === 'swamp')
      if (swamp) {
        swamp.damage = s.damage * SWAMP.share
        swamp.status = s.status
        swamp.shape = { kind: 'circle', r }
      } else {
        spawnAttack(g, {
          ...l, visual: 'swamp', x: p.x, y: p.y,
          shape: { kind: 'circle', r }, motion: { kind: 'follow', ox: 0, oy: 0 },
          damage: s.damage * SWAMP.share, status: s.status, hitInterval: SWAMP.hitInterval, ttl: Infinity,
        })
      }
      const held = near(g, r)
      for (let i = 0; i < s.amount && held.length > 0; i++) {
        const [e] = held.splice(Math.floor(g.rng() * held.length), 1)
        if (!e) break
        spawnAttack(g, {
          ...l, x: e.x, y: e.y,
          shape: { kind: 'circle', r: SWAMP.pillar * s.area }, motion: { kind: 'static' },
          damage: s.damage, knockback: s.knockback, status: s.status,
          ttl: 0.55, activeFrom: 0.12, activeUntil: 0.26, age: -i * 0.08,
        })
      }
      cast(g, 'grassPledge')
    },
  },

  fusionFlare: {
    name: 'Fusion Flare',
    type: 'fire',
    duo: true,
    base: stats({ damage: 84, cooldown: 2.4, amount: 1, duration: 1.6, knockback: 170 }),
    status: { kind: 'burn', chance: 0.6, duration: 3, power: 0.35 },
    upgrades: [{ amount: 1 }, { damage: 18, area: 0.15 }, { duration: 1, statusChance: 0.15 }, { cooldown: -0.4, amount: 1 }],
    // A white-hot comet falls on the thickest crowd and leaves the ground scorched.
    fire: (g, s) => comet(g, s, look('fusionFlare', 'fire', 'comet')),
  },

  fusionBolt: {
    name: 'Fusion Bolt',
    type: 'electric',
    duo: true,
    // No burn to lean on: it hits harder instead.
    base: stats({ damage: 165, cooldown: 2.4, amount: 1, duration: 1.6, knockback: 170 }),
    status: { kind: 'paralysis', chance: 0.5, duration: 1.4, power: 0 },
    upgrades: [{ amount: 1 }, { damage: 36, area: 0.15 }, { duration: 1, statusChance: 0.15 }, { cooldown: -0.4, amount: 1 }],
    // A comet of lightning falls on the thickest crowd and leaves the ground crackling.
    fire: (g, s) => comet(g, s, look('fusionBolt', 'electric', 'comet')),
  },

  ionDeluge: {
    name: 'Ion Deluge',
    type: 'electric',
    duo: true,
    base: stats({ damage: 30, cooldown: 1.3, amount: 2, duration: 4 }),
    status: { kind: 'paralysis', chance: 0.25, duration: 1, power: 0 },
    upgrades: [{ amount: 1 }, { damage: 9, duration: 1 }, { area: 0.25, statusChance: 0.1 }, { cooldown: -0.3, amount: 1 }],
    // Puddles splash under the foes and conduct: every one zaps whatever stands in it,
    // all together, with arcs between them. Rain adds a puddle to each cast.
    fire: (g, s) => {
      const p = g.player
      const foes = near(g, ION.reach)
      const count = s.amount + (weatherHere(g) === 'rain' ? 1 : 0)
      for (let i = 0; i < count; i++) {
        const e = foes.length > 0 ? foes.splice(Math.floor(g.rng() * foes.length), 1)[0] : undefined
        const off = fromAngle(range(g.rng, 0, TAU), range(g.rng, 30, 90))
        const at = e ? { x: e.x, y: e.y } : { x: p.x + off.x, y: p.y + off.y }
        spawnAttack(g, {
          ...look('ionDeluge', 'electric', 'ionPuddle'), x: at.x, y: at.y,
          shape: { kind: 'circle', r: ION.r * s.area }, motion: { kind: 'static' },
          damage: s.damage, status: s.status, hitInterval: ION.hitInterval, ttl: s.duration, activeFrom: 0.15, age: -i * 0.06,
        })
      }
      // Over the cap, the oldest puddles dry up.
      const puddles = g.attacks.filter((a) => ownAttack(g, a) && a.visual === 'ionPuddle' && a.move === 'ionDeluge' && a.age < a.ttl - 0.25)
      for (let i = 0; i < puddles.length - ION.max; i++) puddles[i]!.ttl = Math.max(0, puddles[i]!.age) + 0.25
      cast(g, 'ionDeluge')
    },
  },

  freezeDry: {
    name: 'Freeze-Dry',
    type: 'ice',
    duo: true,
    base: stats({ damage: 32, cooldown: 2.2, amount: 1, duration: 0.6, knockback: 50 }),
    status: { kind: 'freeze', chance: 0.5, duration: 1.6, power: 0 },
    upgrades: [{ amount: 1 }, { damage: 6, statusChance: 0.15 }, { area: 0.25 }, { cooldown: -0.3, area: 0.15 }],
    // A freezing mist rolls out all around the player, freezing foes solid (their next hit doubles and breaks the ice).
    fire: (g, s) => {
      const reach = FREEZE_DRY.r * s.area
      for (let i = 0; i < s.amount; i++) {
        spawnAttack(g, {
          ...look('freezeDry', 'ice', 'freezeDry'), x: g.player.x, y: g.player.y,
          shape: { kind: 'circle', r: 6 }, motion: { kind: 'follow', ox: 0, oy: 0 },
          damage: s.damage, knockback: s.knockback, status: s.status, bonus: FROZEN_BONUS,
          grow: (reach - 6) / s.duration, ttl: s.duration + 0.25, activeUntil: s.duration, age: -i * FREEZE_DRY.gap,
        })
      }
      cast(g, 'freezeDry')
    },
  },

  nightmare: {
    name: 'Nightmare',
    type: 'ghost',
    duo: true,
    base: stats({ damage: 46, cooldown: 1.4, amount: 5 }),
    status: { kind: 'poison', chance: 0.55, duration: 3, power: 0.3 },
    upgrades: [{ amount: 2 }, { damage: 14, statusChance: 0.15 }, { area: 0.25, statusDamage: 0.25 }, { cooldown: -0.3, amount: 2 }],
    // A Hex that chains from foe to foe, poisoning them, and a skull that bites each one again a moment
    // later: afflicted foes take ×2 and poisoned ones ×1.5 on top, so the second bite lands ×3.
    fire: (g, s) => {
      const p = g.player
      const targets = chainTargets(g.enemies, p, s.amount, CHAIN_RANGE, CHAIN_JUMP * s.area)
      let from = { x: p.x, y: p.y - 10 }
      targets.forEach((e: Enemy, hop) => {
        const to = { x: e.x, y: e.y - e.radius }
        const damage = chainDamage(s.damage, hop)
        const arc: Attack = spawnAttack(g, {
          ...look('nightmare', 'ghost', 'nightmare'), ...to, from,
          shape: { kind: 'circle', r: 4 * s.area }, motion: { kind: 'static' },
          damage, bonus: NIGHTMARE_BONUS, status: s.status, ttl: 0.3, activeFrom: Infinity, age: -hop * 0.035,
        })
        damageEnemy(g, e, arc)
        if (arc.mod) modHit(g, arc, e)
        // The bite hits one foe (and vanishes); the skull is drawn by a harmless twin that lingers.
        const echo = -(NIGHTMARE_ECHO + hop * 0.035)
        spawnAttack(g, {
          ...look('nightmare', 'ghost', 'hitbox'), ...to,
          shape: { kind: 'circle', r: e.radius + 5 * s.area }, motion: { kind: 'static' },
          damage, bonus: NIGHTMARE_BONUS, status: s.status, pierce: 1, ttl: 0.1, activeUntil: 0.06, age: echo,
        })
        spawnAttack(g, {
          ...look('nightmare', 'ghost', 'nightmareSkull'), ...to,
          shape: { kind: 'circle', r: 4 }, motion: { kind: 'static' }, damage: 0, ttl: 0.5, activeFrom: Infinity, age: echo,
        })
        from = to
      })
      cast(g, 'nightmare')
    },
  },
} as const satisfies Record<string, MoveDef>

export type DuoMoveId = keyof typeof DUO_MOVES

/** A comet's landing this tick: the ground shakes and the shell hears the boom. */
export const updateDuos = (g: Game, dt: number) => {
  for (const a of g.attacks) {
    if (a.visual !== 'comet' || a.age >= a.activeFrom || a.age + dt < a.activeFrom || !ownAttack(g, a)) continue
    shakeScreen(g, 5)
    g.events.push({ kind: a.type === 'electric' ? 'thunder' : 'quake' })
  }
}
