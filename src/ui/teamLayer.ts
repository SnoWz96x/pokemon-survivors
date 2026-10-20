import type { Input } from '../engine/input'
import type { Vec } from '../engine/math'
import type { PickScreen, TickEntry } from '../game/lockstep'
import { phaseOf } from '../game/players'
import type { Game, Offer, Phase, Player } from '../game/types'
import { createTeamCamera, cycleWatched, spectating, updateTeamCamera, watched } from '../render/teamCamera'
import type { Screen } from './screens'
import { createTeamHud, seatName } from './teamHud'
import { pickClock, spectatorBanner, teamEnd, teamWait } from './teamScreens'

/** A tick entry as this client sends it: the session stamps its seat (`slot`). */
export type SeatEntry = TickEntry extends infer E ? (E extends { slot: number } ? Omit<E, 'slot'> : never) : never

/** This client's input for a frame: the stick and the buttons pressed since the last one. */
export type SeatInput = { move: Vec; special: boolean; mega: boolean; lunge: boolean }

/**
 * What runs a co-op game for the shell: the network session (PR 5) or the
 * one-tab dev run (`coopLocal.ts`). The shell calls `advance` every frame
 * instead of `step`, sends picks and votes through `send`, and wires the end
 * screen's buttons to `playAgain` (the same team, a new run) and `lobby`.
 */
export type CoopDriver = {
  /** Plays the ticks due this frame (`stepTick`) with this client's input; how many it played. */
  advance: (g: Game, dt: number, input: SeatInput) => number
  /** Queues one of this seat's entries for the next tick (a pick, a reroll, a vote). */
  send: (entry: SeatEntry) => void
  playAgain: () => void
  lobby: () => void
}

/** The pick screens a player can be on (`PickScreen`), by their own phase. */
const pickScreen = (p: Player): PickScreen | null => (p.phase === 'playing' || p.phase === 'evolving' ? null : p.phase)

/**
 * The co-op layer over a run, everything the shell shows that solo doesn't:
 * the team's cards, the wait while teammates pick, the clock on this player's
 * pick screens, the spectator camera and its banner while fainted, and the
 * end (vote and results). The shell makes one per co-op run and calls:
 * `frame` every frame before drawing (then draws through `camera`, see
 * `drawFrom`), `decorate` on each pick overlay it opens, `end` for the
 * `victory`/`gameover` overlay, and `pick`/`levelUp` to act on its screens.
 */
export const createTeamLayer = (root: HTMLElement, input: Input, driver: CoopDriver) => {
  const camera = createTeamCamera()
  const hud = createTeamHud(root)
  let me: Player | null = null
  let game: Game | null = null
  const cycle = () => game && me && cycleWatched(camera, game, me)
  const banner = spectatorBanner(root, cycle)
  let wait: ReturnType<typeof teamWait> | null = null
  let clock: { el: HTMLElement; update: () => void } | null = null
  let end: Screen | null = null
  // Tab, Q or the special (useless while fainted) switch whom the camera watches.
  const offKey = input.onKey((key) => {
    if (game && me && spectating(game, me) && (key === 'Tab' || key === 'KeyQ' || key === 'Space')) cycle()
  })

  /** Every frame: the cards, the banners and the camera for a `view` (world px) of this client's. */
  const frame = (g: Game, self: Player, dt: number, view: { w: number; h: number }) => {
    game = g
    me = self
    hud.update(g, self)
    // Fainted with someone to watch: the banner names them.
    banner.show(spectating(g, self) ? seatName(g, watched(camera, g, self).slot) : null)
    // Held by teammates' level-ups after this player picked: who's still choosing.
    const waiting = g.phase === 'levelup' && phaseOf(g, self) === 'playing' && !self.gone
    if (waiting && !wait) wait = teamWait(hud.el, g, self)
    if (!waiting && wait) {
      wait.dispose()
      wait = null
    }
    wait?.update()
    if (clock && !clock.el.isConnected) clock = null
    clock?.update()
    end?.tick?.(0)
    updateTeamCamera(camera, g, self, view.w, view.h, dt)
  }

  /** Puts the auto-pick clock on a pick overlay the shell just opened (and, on the team's level-up, who already picked). */
  const decorate = (overlay: Screen, g: Game, self: Player, phase: Phase) => {
    if (phase === 'paused' || phase === 'victory' || phase === 'gameover' || phase === 'evolving' || phase === 'playing') return
    const made = pickClock(g, self, phase === 'levelup')
    // In the screen's box under its title; screens without one (the Ability, a branch) get it as a box of its own on top.
    const host = overlay.el.querySelector('.dialog, .tm-stage')
    const title = host?.querySelector(':scope > .dialog-title')
    if (title) title.after(made.el)
    else if (host) host.prepend(made.el)
    else {
      made.el.classList.add('box', 'floating')
      overlay.el.prepend(made.el)
    }
    clock = made
  }

  /** The overlay for the run's end (victory or game over), ticked by `frame`. */
  const showEnd = (g: Game, self: Player) => {
    end = teamEnd(root, input, g, self, { vote: (endless) => driver.send({ kind: 'endless', vote: endless }), playAgain: driver.playAgain, lobby: driver.lobby })
    const screen = end
    return { ...screen, dispose: () => ((end = end === screen ? null : end), screen.dispose()) }
  }

  /** A card picked on this player's screen, sent as that screen's round. */
  const pick = (self: Player, offer: Offer) => {
    const screen = pickScreen(self)
    const index = self.offers.indexOf(offer)
    if (screen && index >= 0) driver.send({ kind: 'pick', screen, round: self.round, index })
  }

  /** The level-up screen's buttons (reroll, skip, Esquecer) as entries. */
  const levelUp = (self: Player) => ({
    reroll: () => driver.send({ kind: 'reroll', round: self.round }),
    skip: () => driver.send({ kind: 'skip', round: self.round }),
    banish: (index: number) => driver.send({ kind: 'banish', round: self.round, index }),
  })

  const dispose = () => {
    offKey()
    hud.dispose()
    banner.dispose()
    wait?.dispose()
  }

  return { camera, driver, frame, decorate, end: showEnd, pick, levelUp, dispose }
}

export type TeamLayer = ReturnType<typeof createTeamLayer>
