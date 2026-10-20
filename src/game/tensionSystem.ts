import { edgeDistance, harmAfter, reachAfter, TENSION, tensionAfter, tensionCeiling } from './tension'
import { mostHurt, nearestPlayer } from './players'
import type { Enemy, Game, Player } from './types'
import * as dm from '../engine/dmath'
import { roomOf } from './room'

/** Center of a player's screen in the world (it trails the player by a few px). */
const screenCenter = (g: Game, p: Player) => ({ x: p.screen.x + g.view.w / 2, y: p.screen.y + g.view.h / 2 })

/** A regular chasing the players just died: how far into the nearest one's screen it got feeds `reach`. Bosses and flybys don't count. */
export const noteKill = (g: Game, e: Enemy) => {
  if (e.boss || e.behavior.kind !== 'chase' || roomOf(g)) return
  const c = screenCenter(g, nearestPlayer(g, e.x, e.y))
  const dx = e.x - c.x
  const dy = e.y - c.y
  const d = dm.hypot(dx, dy)
  const ratio = d > 0 ? d / edgeDistance(g.view, dx / d, dy / d) : 0
  g.tension.reach = reachAfter(g.tension.reach, ratio)
}

/** The acting player lost `hp`: it feeds `harm`, which eases the tension. */
export const noteHarm = (g: Game, hp: number) => {
  g.tension.harm += hp / Math.max(1, g.player.stats.maxHp) / TENSION.harmTau
}

/** The share of HP the most hurt player has left: the team is as comfortable as its weakest member. */
const teamHealth = (g: Game) => {
  const p = mostHurt(g)
  return p.hp / Math.max(1, p.stats.maxHp)
}

/** One tick of the director (none before `TENSION.from`). The spawner holds it still while the finale boss lives. */
export const updateTension = (g: Game, dt: number) => {
  const s = g.tension
  s.harm = harmAfter(s.harm, 0, dt)
  if (g.time < TENSION.from) return
  s.level = Math.min(tensionCeiling(g.time), tensionAfter(s, teamHealth(g), dt))
}

/**
 * Where a regular spawning at `angle` around player `p` comes in: on the far
 * ring (`ring` px from them) at no tension, `near` of the way to just
 * outside their screen's edge that way at full.
 */
export const spawnPoint = (g: Game, p: Player, angle: number, ring: number, near: number) => {
  const ux = dm.cos(angle)
  const uy = dm.sin(angle)
  const c = screenCenter(g, p)
  const edge = edgeDistance(g.view, ux, uy) + TENSION.margin
  const fromCenter = Math.min(ring, edge) * near + ring * (1 - near)
  // The ring is measured from the player; the edge from the screen's center, a few px off.
  return near > 0 ? { x: c.x + ux * fromCenter, y: c.y + uy * fromCenter } : { x: p.x + ux * ring, y: p.y + uy * ring }
}
