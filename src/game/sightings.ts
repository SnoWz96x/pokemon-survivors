import { ENEMIES } from '../data/enemies'
import { playerForm } from './branch'
import { MEOWTH_DEX } from './mapEventRules'
import type { Game } from './types'

/** Sightings checked per second: often enough to catch a swarm crossing the screen. */
const CHECKS_PER_SECOND = 4

/** Whether (x, y) is on some player's screen, edges included. */
const onScreen = (g: Game, x: number, y: number) => {
  for (const { screen: s } of g.players) if (x >= s.x && x <= s.x + g.view.w && y >= s.y && y <= s.y + g.view.h) return true
  return false
}

/**
 * Logs every species on screen into the run's Pokédex log: wild Pokémon, the
 * fleeing Meowth and the players' own forms, which also count as caught (it's
 * theirs, like an evolution on the handhelds).
 */
export const updateSightings = (g: Game, dt: number) => {
  if (Math.floor(g.now * CHECKS_PER_SECOND) === Math.floor((g.now - dt) * CHECKS_PER_SECOND)) return
  const seen = g.dexLog.seen
  const actor = g.player
  for (const p of g.players) {
    g.player = p
    const form = playerForm(g).dex
    seen.add(form)
    g.dexLog.own.set(form, p.shiny)
  }
  g.player = actor
  for (const e of g.enemies) if (e.dying < 0 && onScreen(g, e.x, e.y)) seen.add(ENEMIES[e.kind].dex)
  for (const ev of g.mapEvents.list) if (ev.kind === 'meowth' && ev.gone < 0 && onScreen(g, ev.x, ev.y)) seen.add(MEOWTH_DEX)
}
