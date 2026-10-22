import { dirTo, fromAngle } from '../engine/math'
import { burst, shakeScreen } from './effects'
import { updateLegendary2 } from './legendary2'
import { LEAF, WHIRL } from './legendaryMoves'
import { moveStats, type MoveId } from './moves'
import { nearestEnemy } from './queries'
import { spawnAttack } from './spawn'
import { ownAttack } from './players'
import type { Attack, Game } from './types'

/**
 * Per-tick side of the legendary moves (`legendaryMoves.ts`). Launchers wait
 * by the player (a `follow` hitbox, harmless until `activeFrom`) and take off
 * once their age reaches `memo`: Psycho Boost's comets and Magical Leaf's
 * leaves home in on a foe each, Ancient Power's stones fly straight at one.
 * Whirlwind's cyclone ends in a gust that flings the foes around it. `game.ts`
 * calls `updateLegendary` every tick, before the moves cast; the second
 * batch's side runs in `updateLegendary2` (`legendary2.ts`).
 */

/** How the launchers of each move take off: homing (and how hard it turns) or straight. */
const LAUNCH: Partial<Record<MoveId, { homing: boolean; turn: number; ttl: number }>> = {
  psychoBoost: { homing: true, turn: 6, ttl: 1.8 },
  magicalLeaf: { homing: true, turn: LEAF.turn, ttl: 1.6 },
  ancientPower: { homing: false, turn: 0, ttl: 1.2 },
}

/** The launch speed of `move`: its cast's speed (player boosts included), or a default when it isn't owned anymore. */
const launchSpeed = (g: Game, move: MoveId) => {
  const owned = g.player.moves.find((m) => m.id === move)
  return owned ? moveStats(owned.id, owned.level, g.player.stats, owned.path).speed : 240
}

/** Foes already chased by a launched hitbox of `move`, so the next one picks another. */
const chased = (g: Game, move: MoveId) => {
  const ids = new Set<number>()
  for (const a of g.attacks) if (ownAttack(g, a) && a.move === move && a.motion.kind === 'homing' && a.motion.target) ids.add(a.motion.target.id)
  return ids
}

const launch = (g: Game, a: Attack, move: MoveId, how: { homing: boolean; turn: number; ttl: number }, speed: number) => {
  const target = nearestEnemy(g, a.x, a.y, 280, chased(g, move)) ?? nearestEnemy(g, a.x, a.y, 280)
  const p = g.player
  // Without a foe the launcher flies outward from the player.
  const d = target ? dirTo(a.x, a.y, target.x, target.y - target.radius) : dirTo(p.x, p.y - 10, a.x, a.y, fromAngle(a.id * 2.4))
  const vx = d.x * speed
  const vy = d.y * speed
  a.motion = how.homing ? { kind: 'homing', vx, vy, speed, turn: how.turn, target } : { kind: 'linear', vx, vy }
  a.from = { x: a.x, y: a.y }
  a.ttl = a.age + how.ttl
  a.memo = -1
}

/** The cyclone's last gust: a ring that hurts and flings away the foes around it. */
const gust = (g: Game, a: Attack) => {
  const r = a.shape.kind === 'circle' ? a.shape.r : 24
  spawnAttack(g, {
    move: a.move, type: a.type, visual: 'whirlBurst', x: a.x, y: a.y,
    shape: { kind: 'circle', r: r * (WHIRL.burstR / 24) }, motion: { kind: 'static' },
    damage: a.damage * WHIRL.burst, knockback: 260, ttl: 0.4, activeUntil: 0.06, mod: null,
  })
  burst(g, a.x, a.y - 10, { colors: ['#ffffff', '#c8d8f0', '#7890c8'], count: 14, speed: 140, ttl: 0.4 })
  a.memo = 1
}

export const updateLegendary = (g: Game) => {
  updateLegendary2(g)
  const speeds = new Map<MoveId, number>()
  for (const a of g.attacks) {
    if (a.age < 0 || a.move === 'special' || a.move === 'ability' || !ownAttack(g, a)) continue
    // The big impacts shake the screen the moment they land.
    if ((a.visual === 'ascentImpact' || a.visual === 'timeSnap' || a.visual === 'boostBurst') && a.memo === 0) {
      shakeScreen(g, a.visual === 'boostBurst' ? 1.5 : 3)
      a.memo = 1
      continue
    }
    if (a.visual === 'whirlwind' && a.memo === 0 && a.age >= a.ttl - 0.05) {
      gust(g, a)
      continue
    }
    const how = LAUNCH[a.move]
    if (!how || a.motion.kind !== 'follow' || a.memo <= 0 || a.age < a.memo) continue
    const speed = speeds.get(a.move) ?? launchSpeed(g, a.move)
    speeds.set(a.move, speed)
    launch(g, a, a.move, how, speed)
  }
}
