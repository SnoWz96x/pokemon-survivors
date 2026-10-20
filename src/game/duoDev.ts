import { CURSE_IDS, type CurseId } from '../data/curses'
import { evolvedFrom } from '../data/evolutions'
import type { PokeType } from '../data/types'
import { legendSignature } from '../data/legends'
import { DUO_MOVES, type DuoMoveId } from './duoMoves'
import { DUO_RECIPES, isDuo, readyDuos } from './duoRules'
import { decideCurse } from './curseSystem'
import { advancePhase } from './game'
import { applyOffer } from './leveling'
import { maxMoveLevel, MOVE_IDS, MOVES } from './moves'
import { setPhase } from './players'
import type { Game } from './types'

/** The first plain base move of a type (no duo, no evolved one), to stage a recipe. */
const baseOf = (type: PokeType) => MOVE_IDS.find((id) => MOVES[id].type === type && !isDuo(id) && !evolvedFrom(id) && MOVES[id].upgrades.length === 7)

/**
 * Dev-console helpers for duo moves and cursed items, wired in `main.ts` for
 * dev builds only:
 * - `ps.duo('firePledge')` gives the run a maxed move of each of the recipe's
 *   types (past the learnset and the slot cap) and opens a level-up, where the
 *   golden duo card waits; `ps.duo('ionDeluge', 'now')` fuses on the spot.
 * - `ps.curse('lifeOrb')` opens a chest's cursed item choice now (any cursed
 *   item not held without an argument); `ps.curse('ironBall', 'take')` just takes it.
 */
export const duoDevTools = (game: () => Game | undefined) => ({
  duo: (id: DuoMoveId = 'firePledge', when: 'card' | 'now' = 'card') => {
    const g = game()
    if (!g) return console.warn('ps: start a run first')
    if (!(id in DUO_MOVES)) return console.warn(`ps: no duo "${id}". Duos: ${Object.keys(DUO_MOVES).join(', ')}`)
    const recipe = DUO_RECIPES.find((r) => r.to === id || ('alt' in r && r.alt === id))
    if (!recipe) return
    const p = g.player
    // Fusion Bolt is the Fusion Flare recipe with the Electric move the stronger one.
    const types = 'alt' in recipe && recipe.alt === id ? [recipe.types[1], recipe.types[0]] as const : recipe.types
    for (const type of types) {
      const move = p.moves.find((m) => MOVES[m.id].type === type && !isDuo(m.id))?.id ?? baseOf(type)
      if (!move) continue
      const owned = p.moves.find((m) => m.id === move)
      if (owned) owned.level = Math.max(owned.level, maxMoveLevel(move))
      else p.moves.push({ id: move, level: maxMoveLevel(move), cooldown: 0 })
    }
    const ready = readyDuos(p.moves, legendSignature(g.player.starter)).find((d) => d.to === id) ?? readyDuos(p.moves, legendSignature(g.player.starter))[0]
    if (!ready) return console.warn('ps: no fusion ready (one duo per run: already fused one?)')
    // Fused on the spot, it's the duo asked for even when the recipe would make its twin (Flare and Bolt).
    if (when === 'now') applyOffer(g, { kind: 'duo', from: ready.from, to: id })
    else if (g.phase === 'playing') {
      g.player.level++
      g.player.pendingLevelUps++
      advancePhase(g)
    }
    return p.moves.map((m) => `${m.id}:${m.level}`)
  },
  curse: (id?: CurseId, when: 'chest' | 'take' = 'chest') => {
    const g = game()
    if (!g) return console.warn('ps: start a run first')
    const pick = id ?? CURSE_IDS.find((c) => !g.player.curses.held.includes(c))
    if (!pick || !CURSE_IDS.includes(pick)) return console.warn(`ps: cursed items: ${CURSE_IDS.join(', ')}`)
    if (when === 'take') return decideCurse(g, pick, true)
    if (g.phase !== 'playing') return console.warn('ps: close menus first')
    setPhase(g, 'curse')
    g.player.offers = [{ kind: 'curse', id: pick, take: true }, { kind: 'curse', id: pick, take: false }]
    g.events.push({ kind: 'curse', id: pick, moment: 'found' })
  },
})
