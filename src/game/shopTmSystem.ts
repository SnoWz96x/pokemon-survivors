import { burst } from './effects'
import { healPlayer } from './combat'
import { took } from './kitRules'
import { MOVES, moveStats, type CastStats, type MoveDef } from './moves'
import { isAlive } from './queries'
import { RAIN_DANCE, SUNNY_DAY, WEATHER_CALL } from './shopTmMoves2'
import { spawnAttack } from './spawn'
import { applyStatus } from './status'
import type { Attack, Enemy, Game, OwnedMove } from './types'
import { weatherHere } from './weather'
import * as dm from '../engine/dmath'

/**
 * Engine side of Rain Dance and Sunny Day (`shopTmMoves2.ts`): while a cast's
 * marker stays on the player, every `WEATHER_CALL.every` s its raindrops or
 * sunbeams fall on random foes around the player, with the move's current
 * stats and fork mods. Soothing Rain heals while its rain falls on the
 * player, and Scorching Sun burns the foes in the sun-lit ring on each beat.
 * `game.ts` calls `updateShopTms` every tick; it costs one pass over the
 * attacks when neither move is out.
 */

/** Foes a beat can fall on, refilled each beat (kept to spare the allocation). */
const near: Enemy[] = []

/** The move's slot behind a marker, if the player still has it. */
const ownerOf = (g: Game, a: Attack) => g.player.moves.find((m) => m.id === a.move)

/** One beat: `s.amount` drops (or beams) on distinct random foes in reach, a warning ring first. */
const beat = (g: Game, a: Attack, s: CastStats, owned: OwnedMove) => {
  const p = g.player
  near.length = 0
  const reach2 = WEATHER_CALL.reach * WEATHER_CALL.reach
  for (const e of g.enemies) if (isAlive(e) && dm.sq(e.x - p.x) + dm.sq(e.y - p.y) <= reach2) near.push(e)
  const def: MoveDef = MOVES[owned.id]
  const visual = a.visual === 'rainDance' ? 'rainDrop' : 'sunBeam'
  const r = WEATHER_CALL.r * s.area
  for (let i = 0; i < s.amount && near.length > 0; i++) {
    const k = Math.floor(g.rng() * near.length)
    const e = near[k]!
    near[k] = near[near.length - 1]!
    near.pop()
    spawnAttack(g, {
      move: owned.id, type: def.type, visual: 'telegraph', x: e.x, y: e.y,
      shape: { kind: 'circle', r }, motion: { kind: 'static' }, damage: 0, ttl: WEATHER_CALL.fall, activeFrom: Infinity, mod: null,
    })
    // The hit carries the fork's mods, like a cast's (`castMods`).
    const before = g.player.castMods
    g.player.castMods = s.mods
    spawnAttack(g, {
      move: owned.id, type: def.type, visual, x: e.x, y: e.y - e.radius,
      shape: { kind: 'circle', r }, motion: { kind: 'static' },
      damage: s.damage, knockback: s.knockback, age: -WEATHER_CALL.fall, ttl: WEATHER_CALL.linger, activeUntil: 0.08,
    })
    g.player.castMods = before
  }
  // Scorching Sun: the foes standing in the sun-lit ring catch fire.
  if (owned.id === 'sunnyDay' && took(owned, 4, 1)) {
    const ring2 = dm.sq(SUNNY_DAY.ring * s.area)
    for (const e of g.enemies) {
      if (!isAlive(e) || dm.sq(e.x - p.x) + dm.sq(e.y - p.y) > ring2) continue
      applyStatus(e.status, SUNNY_DAY.burn, s.damage, e.boss, 'sunnyDay')
      burst(g, e.x, e.y - e.radius, { colors: ['#fff3a0', '#f89838'], count: 2, speed: 30, ttl: 0.3, gravity: -60 })
    }
  }
}

/** Ticks the called skies: their beats, and Soothing Rain's heal while it rains where the player stands. */
export const updateShopTms = (g: Game, dt: number) => {
  for (const a of g.attacks) {
    if ((a.visual !== 'rainDance' && a.visual !== 'sunnyDay') || a.age < 0 || a.age >= a.ttl) continue
    const owned = ownerOf(g, a)
    if (!owned) continue
    if (owned.id === 'rainDance' && took(owned, 4, 1) && weatherHere(g) === 'rain') healPlayer(g, g.player.stats.maxHp * RAIN_DANCE.heal * dt)
    a.memo += dt
    if (a.memo < WEATHER_CALL.every) continue
    a.memo -= WEATHER_CALL.every
    beat(g, a, moveStats(owned.id, owned.level, g.player.stats, owned.path), owned)
  }
}
