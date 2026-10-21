import { MOVES, type MoveId } from './moves'
import { tmMoveIds } from './tmMoves'
import type { TmSource } from './tmRules'
import { dropTm, openTutor } from './tms'
import type { Game } from './types'

/**
 * Dev-console helpers for TMs, wired in `main.ts` for dev builds only:
 * `ps.tm('iceBeam')` drops a TM disc 40 px to the right of the player
 * (`ps.tm('psystrike', 'legendary')` a gold one), and `ps.lesson()` opens a
 * Move Tutor's lesson right away. `ps.event('tutor')` places the tent itself.
 */
export const tmDevTools = (game: () => Game | undefined) => ({
  tm: (id: MoveId = 'rockSlide', source: TmSource = 'boss') => {
    const g = game()
    if (!g) return console.warn('ps: start a run first')
    if (!(id in MOVES)) return `TM moves: ${tmMoveIds().join(', ')}`
    dropTm(g, g.player.x + 40, g.player.y, id, source)
    return id
  },
  lesson: () => {
    const g = game()
    if (!g || g.phase !== 'playing') return console.warn('ps: start a run (and close menus) first')
    return openTutor(g) ? g.player.offers : 'The tutor has nothing to teach'
  },
})
