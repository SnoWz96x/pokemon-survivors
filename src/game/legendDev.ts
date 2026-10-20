import { AWAKEN_AT, isLegend, LEGEND_IDS, type LegendId } from '../data/legends'
import { advancePhase } from './game'
import { xpFor } from './leveling'
import type { Game } from './types'

/**
 * Dev console helpers for the Legend mode (`legend.ts`): `ps.legend('kyogre')`
 * starts a Legend-mode run with that legend, `ps.awaken()` levels it up to its
 * next awakening.
 */
export const legendDevTools = (game: () => Game | undefined, start: (id: LegendId) => void) => ({
  legend: (id?: string) => (isLegend(id) ? start(id) : `Legends: ${LEGEND_IDS.join(', ')}`),
  awaken: () => {
    const g = game()
    if (!g?.player.legend || g.phase !== 'playing') return 'Start a Legend-mode run (and close menus) first: ps.legend("kyogre")'
    const at = AWAKEN_AT[g.player.legend.awakened]
    if (at === undefined) return 'Already fully awakened'
    g.player.level = Math.max(g.player.level, at)
    g.player.xp = 0
    g.player.xpNext = xpFor(g.player.level)
    advancePhase(g)
  },
})
