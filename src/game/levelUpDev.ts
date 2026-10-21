import { runLearnset } from './learnsets'
import { loadout, rollOffers, withRarity } from './leveling'
import { forkAt, MOVE_IDS, MOVES, withBranch, type MoveId } from './moves'
import { setPhase } from './players'
import type { Game, Offer, Rarity } from './types'

/**
 * Dev-console shortcuts for the level-up's forks, rare and shiny cards and
 * Esquecer (`ps.fork()`, `ps.path()`, `ps.offers()`, `ps.banishes()`). Wired
 * in `main.ts` for dev builds only.
 */
export const levelUpDevTools = (game: () => Game | undefined) => {
  /** Opens a level-up showing `offers` (the shell draws it on the next frame). */
  const open = (g: Game, offers: Offer[]) => {
    g.player.offers = offers
    g.player.pendingLevelUps = Math.max(1, g.player.pendingLevelUps)
    setPhase(g, 'levelup')
    return offers
  }
  /** The move at `id`, owned (added at level 1 if missing). */
  const own = (g: Game, id: MoveId) => {
    const owned = g.player.moves.find((m) => m.id === id)
    if (owned) return owned
    const fresh = { id, level: 1, cooldown: 0, path: 0 }
    g.player.moves.push(fresh)
    return fresh
  }
  return {
    /**
     * Opens a level-up whose first card takes `id` onto its fork at `level`
     * (`ps.fork('swift')`, `ps.fork('thunder', 7)`); pick it to see the branches.
     */
    fork: (id: MoveId = 'swift', level = 4) => {
      const g = game()
      if (!g) return 'ps: start a run first'
      if (!forkAt(id, level)) return `${id} has no fork at Lv ${level}. Forks: ${MOVE_IDS.filter((m) => forkAt(m, 4)).join(', ')} (Lv 4 and 7)`
      own(g, id).level = level - 1
      const rest = rollOffers(loadout(g), g.rng, 2, { shown: [{ kind: 'move', id, level }] })
      return open(g, [{ kind: 'move', id, level }, ...rest])
    },
    /**
     * Sets a move's level and the branches taken, one letter per fork reached
     * (`ps.path('swift', 8, 'AB')`: Shooting Stars, then Comet).
     */
    path: (id: MoveId = 'swift', level = 8, branches = 'A') => {
      const g = game()
      if (!g) return 'ps: start a run first'
      const owned = own(g, id)
      owned.level = Math.min(level, MOVES[id].upgrades.length + 1)
      owned.path = 0
      let n = 0
      for (let l = 2; l <= owned.level; l++) if (forkAt(id, l)) owned.path = withBranch(owned.path, l, branches[n++] === 'B' ? 1 : 0)
      return owned
    },
    /**
     * Opens a level-up with lucky cards: `ps.offers('shiny')`, `ps.offers('rare')`
     * or `ps.offers()` for one rare, one shiny and one common.
     */
    offers: (rarity?: Rarity) => {
      const g = game()
      if (!g) return 'ps: start a run first'
      // Owning a few of the learnset gives the rare cards levels to jump.
      for (const id of runLearnset(g.player.starter, g.player.branch, g.player.stage).slice(0, 3)) {
        const owned = own(g, id)
        owned.level = Math.max(owned.level, 2)
      }
      const offers = rollOffers(loadout(g), g.rng, 3, { forks: false })
      const rolls = rarity === 'shiny' ? [0, 0, 0] : rarity === 'rare' ? [0.05, 0.05, 0.05] : [0.05, 0, 0.9]
      return open(g, offers.map((o, i) => withRarity(o, rolls[i] ?? 0.9, 0.01)))
    },
    /** Sets the run's Esquecer charges (`ps.banishes(3)`). */
    banishes: (n = 3) => {
      const g = game()
      if (!g) return 'ps: start a run first'
      g.player.banishes = n
      return n
    },
  }
}
