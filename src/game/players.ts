import type { Attack, Game, Phase, Player, PlayerPhase } from './types'
import * as dm from '../engine/dmath'

/**
 * Who's in the run. Per-player code (walking, moves and their hitboxes,
 * leveling and picks, items, curses, damage taken) reads `g.player`, the
 * player acting, and the step runs it as each player in turn (`actAs`). World
 * code (the horde, bosses, spawns, pickups, map events, rifts) asks these
 * helpers which player it's about. Solo there is one player and every helper
 * gives them, without touching the rng, so solo runs play exactly as before.
 */

/**
 * Makes `p` the acting player and returns the one acting before, to hand back
 * the same way (`actAs(g, before)`). A plain swap, no allocation: hot loops
 * (every hitbox, every enemy touching a player) can switch per item.
 */
export const actAs = (g: Game, p: Player): Player => {
  const before = g.player
  g.player = p
  return before
}

/**
 * Runs a per-player system `fn(g, dt)` as each player in slot order, then
 * gives the turn back. Pass a module-level function to keep it allocation-free.
 */
export const eachPlayer = (g: Game, fn: (g: Game, dt: number) => void, dt: number) => {
  const before = g.player
  for (const p of g.players) {
    g.player = p
    fn(g, dt)
  }
  g.player = before
}

/** Whether a hitbox is the acting player's: per-player systems that scan `g.attacks` skip everyone else's. */
export const ownAttack = (g: Game, a: Attack) => a.owner === g.player.slot

/** The player whose hitbox this is (`Attack.owner`); the first one if that slot is gone. */
export const ownerOf = (g: Game, slot: number): Player => g.players[slot] ?? g.players[0]!

/** Standing in the run: can be chased, hit and pick things up. Fainted players aren't (co-op). */
export const inPlay = (p: Player) => p.hp > 0

/** Whether `p` counts for a world system (can be chased, touched, hit): solo the player always does (their HP only hits 0 as the run ends, mid-tick). */
export const standing = (g: Game, p: Player) => g.players.length === 1 || inPlay(p)

/**
 * The player in play nearest to (x, y): who the horde chases and bosses aim
 * at. When nobody stands it falls back to the first player, so callers always
 * get someone (the run is ending anyway).
 */
export const nearestPlayer = (g: Game, x: number, y: number): Player => {
  const { players } = g
  if (players.length === 1) return players[0]!
  let best: Player | null = null
  let bestD = Infinity
  for (const p of players) {
    if (!inPlay(p)) continue
    const d = dm.sq(p.x - x) + dm.sq(p.y - y)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best ?? players[0]!
}

/** The first player in play within `r` px of (x, y) (plus their body radius with `body`), or null. */
export const playerWithin = (g: Game, x: number, y: number, r: number, body = false): Player | null => {
  for (const p of g.players) {
    if (!standing(g, p)) continue
    const reach = body ? r + p.radius : r
    if (dm.sq(p.x - x) + dm.sq(p.y - y) < reach * reach) return p
  }
  return null
}

/** The standing player with the smallest share of HP left (the first on a tie): who the healing and the pressure director look at. */
export const mostHurt = (g: Game): Player => {
  const { players } = g
  if (players.length === 1) return players[0]!
  let worst = players[0]!
  let low = Infinity
  for (const p of players) {
    if (!inPlay(p)) continue
    const share = p.hp / Math.max(1, p.stats.maxHp)
    if (share < low) {
      low = share
      worst = p
    }
  }
  return worst
}

/**
 * The player a world event takes its turn around (a spawn, a ring, a map
 * event, a portal): round-robin over the players in play, by `turn` (any
 * counter that moves, such as `g.nextId`). Solo it's always the player.
 */
export const anchorPlayer = (g: Game, turn = g.nextId): Player => {
  const { players } = g
  if (players.length === 1) return players[0]!
  let standing = 0
  for (const p of players) if (inPlay(p)) standing++
  if (standing === 0) return players[0]!
  let n = ((turn % standing) + standing) % standing
  for (const p of players) {
    if (!inPlay(p)) continue
    if (n-- === 0) return p
  }
  return players[0]!
}

/** Px between teammates set down together (a rift, a place, a domain's arena). */
export const ARRIVAL_GAP = 18

/** Sets the team down at (x, y): side by side in slot order (`ARRIVAL_GAP`); solo the player stands right there. */
export const placeTeam = (g: Game, x: number, y: number) => {
  const n = g.players.length
  for (const p of g.players) {
    p.x = n > 1 ? x + (p.slot - (n - 1) / 2) * ARRIVAL_GAP : x
    p.y = y
  }
}

/**
 * Puts player `p`'s screen's top-left at (x, y). The first player's screen is
 * also the drawn camera (`Game.camera`), which follows it at once.
 */
export const aimScreen = (g: Game, p: Player, x: number, y: number) => {
  p.screen.x = x
  p.screen.y = y
  if (p !== g.players[0]) return
  g.camera.x = x
  g.camera.y = y
}

/** Centers player `p`'s screen on (x, y), framed like a player: 10 px above their feet. */
export const centerScreen = (g: Game, p: Player, x: number, y: number) => aimScreen(g, p, x - g.view.w / 2, y - 10 - g.view.h / 2)

/**
 * Moves every player's screen to where they stand (centered, a little above
 * their feet) unless `frame` aims it itself (a legendary's domain eases it to
 * frame the fight: `domainCamera`, run as each player); the drawn camera goes
 * with the first one's.
 */
export const followPlayers = (g: Game, frame: (g: Game) => boolean = () => false) => {
  const before = g.player
  for (const p of g.players) {
    g.player = p
    if (!frame(g)) centerScreen(g, p, p.x, p.y)
  }
  g.player = before
}

/**
 * Whether (x, y) shows on some player's screen, grown by `margin` px on every
 * side (shrunk when negative) and by `bottom` px at the bottom.
 */
export const onAnyScreen = (g: Game, x: number, y: number, margin = 0, bottom = margin) => {
  for (const p of g.players) {
    const s = p.screen
    if (x > s.x - margin && x < s.x + g.view.w + margin && y > s.y - margin && y < s.y + g.view.h + bottom) return true
  }
  return false
}

/** The world's phases that aren't a player's: it plays, waits on the pause menu, or the run is over. */
const worldPhase = (phase: Phase) => phase === 'playing' || phase === 'paused' || phase === 'gameover' || phase === 'victory'

/**
 * The phase as `p` sees it: the world's while it plays, is paused or is over;
 * their own pick screen or evolution while the world waits on the team. Solo
 * it's always `g.phase`. Pick rules check it, so a pick belongs to its player.
 */
export const phaseOf = (g: Game, p: Player = g.player): Phase => (worldPhase(g.phase) ? g.phase : p.phase)

/**
 * Sets `p`'s own phase (a pick screen, an evolution, back to playing) and the
 * world's: held on the first player in slot order who isn't playing, playing
 * once nobody is busy. Solo the world takes `phase` as is.
 */
export const setPhase = (g: Game, phase: PlayerPhase, p: Player = g.player) => {
  p.phase = phase
  let team: PlayerPhase = 'playing'
  for (const q of g.players) {
    if (q.phase === 'playing') continue
    team = q.phase
    break
  }
  g.phase = team
}

/** The shell's own player: solo, the only one. */
export const localPlayer = (g: Game): Player => g.players[0]!
