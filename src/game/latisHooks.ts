import { range } from '../engine/rng'
import { ENEMIES } from '../data/enemies'
import { spawnHazard } from './bosses'
import { harmBy } from './harm'
import type { DomainHooks } from './domainHooks'
import { anchorPlayer } from './players'
import type { Game } from './types'
import * as dm from '../engine/dmath'

/**
 * The Eon duo's dream crossing (`data/domains/latis.ts`): mirages of Latias
 * and Latios swoop across the path ahead of a player (they take turns), their lanes marked
 * first; every third pass both cross at once. The battle's pair rules are the
 * engine's (`domainPair.ts`).
 */
const MIRAGE = { from: 4, every: 3.6, windup: 1.1, speed: 230, width: 18, damage: 12 } as const

/** A mirage streaking across a player's screen (`anchorPlayer`) through a point `ahead` px north of them. */
const mirage = (g: Game, latios: boolean, ahead: number) => {
  const p = anchorPlayer(g)
  const s = p.screen
  const left = g.rng() < 0.5
  const x = left ? s.x - 16 : s.x + g.view.w + 16
  const y = p.y - ahead + range(g.rng, -20, 20)
  const ty = p.y - ahead + range(g.rng, -30, 30)
  const tx = left ? s.x + g.view.w + 16 : s.x - 16
  const a = dm.atan2(ty - y, tx - x)
  const len = dm.hypot(tx - x, ty - y)
  const visual = latios ? 'luster' : 'mist'
  spawnHazard(g, { kind: 'beam', visual, x, y, r: MIRAGE.width / 2, damage: 0, angle: a, len, armAt: MIRAGE.windup, disarmAt: MIRAGE.windup, ttl: MIRAGE.windup })
  spawnHazard(g, {
    kind: 'shot', visual, x, y, vx: dm.cos(a) * MIRAGE.speed, vy: dm.sin(a) * MIRAGE.speed, r: MIRAGE.width / 2,
    damage: MIRAGE.damage, armAt: MIRAGE.windup, ttl: MIRAGE.windup + len / MIRAGE.speed, phantom: ENEMIES[latios ? 'latios' : 'latias'].dex, by: harmBy(latios ? 'latios' : 'latias'),
  })
}

export const LATIS_HOOKS: DomainHooks = {
  crossing: (g, d, dt) => {
    if (d.age < MIRAGE.from) return
    const pass = Math.floor((d.age - MIRAGE.from) / MIRAGE.every)
    if (pass === Math.floor((d.age - dt - MIRAGE.from) / MIRAGE.every)) return
    const ahead = range(g.rng, 40, 90)
    mirage(g, pass % 2 === 1, ahead)
    if (pass % 3 === 2) mirage(g, pass % 2 === 0, ahead + 30)
  },
}
