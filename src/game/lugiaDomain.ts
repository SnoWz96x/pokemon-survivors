import { LUGIA_WHIRLPOOLS } from '../data/domains/lugia'
import { spawnHazard } from './bosses'
import { harmBy } from './harm'
import type { DomainHooks } from './domainHooks'

/** Lugia's hooks: the whirlpools sitting in the Whirl Islands' channels, set once as the crossing begins (`memo[0]`: placed). */
export const LUGIA_HOOKS: DomainHooks = {
  crossing: (g, d) => {
    const arena = g.rift.arena
    if (d.memo[0] === 1 || !arena) return
    d.memo[0] = 1
    for (const w of LUGIA_WHIRLPOOLS) {
      spawnHazard(g, {
        kind: 'zone', visual: 'water', x: arena.x + w.x, y: arena.y + w.y, r: w.r, damage: 5,
        armAt: 0.5, disarmAt: Infinity, ttl: Infinity, pull: w.pull, pullReach: w.reach, by: harmBy('lugia'),
      })
    }
  },
}
