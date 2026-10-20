import { fainted } from '../game/coop'
import type { Game, Player } from '../game/types'

/**
 * The co-op camera, shell state only (never part of the simulation, so it
 * never reaches a snapshot or a hash): it follows this client's player and,
 * while they lie fainted (or have left), a teammate still standing, which a
 * tap or a key cycles (`cycleWatched`). Back on their feet, it returns to
 * them. Switching who it follows eases over instead of cutting.
 */
export type TeamCamera = {
  /** Top-left of the drawn view, in world px. */
  x: number
  y: number
  /** The slot being watched while spectating (null: the client's own player). */
  follow: number | null
  /** Easing from one player to another: 1 right after a switch, down to 0. */
  ease: number
  /** Whether the camera has a position yet (the first frame snaps). */
  placed: boolean
}

export const createTeamCamera = (): TeamCamera => ({ x: 0, y: 0, follow: null, ease: 0, placed: false })

/** Whether a teammate can be watched: still in the run, on their feet. Away ones count only if nobody else does. */
const watchable = (p: Player) => !p.gone && !fainted(p)

/** Players worth spectating, in slot order from `me` on: standing first, then away ones. Null if nobody stands. */
const nextWatchable = (g: Game, me: Player, from: number, step: 1 | -1): Player | null => {
  const n = g.players.length
  let fallback: Player | null = null
  for (let i = 1; i <= n; i++) {
    const p = g.players[(((from + step * i) % n) + n) % n]!
    if (p === me || !watchable(p)) continue
    if (!p.away) return p
    fallback ??= p
  }
  return fallback
}

/** Whether the client is spectating: their player is fainted or gone, and a teammate stands to watch. */
export const spectating = (g: Game, me: Player) => g.coop !== null && (me.gone || fainted(me)) && nextWatchable(g, me, me.slot, 1) !== null

/**
 * Who the camera follows: the client's own player while they stand; while
 * spectating, the teammate picked (kept while they stand, else the next one).
 */
export const watched = (cam: TeamCamera, g: Game, me: Player): Player => {
  if (!spectating(g, me)) return me
  const current = cam.follow === null ? undefined : g.players[cam.follow]
  if (current && current !== me && watchable(current) && !current.away) return current
  return nextWatchable(g, me, cam.follow ?? me.slot, 1) ?? me
}

/** Watches the next (or previous) teammate standing. A no-op unless spectating. */
export const cycleWatched = (cam: TeamCamera, g: Game, me: Player, step: 1 | -1 = 1) => {
  if (!spectating(g, me)) return
  const from = watched(cam, g, me)
  const next = nextWatchable(g, me, from.slot, step)
  if (!next || next === from) return
  cam.follow = next.slot
  cam.ease = 1
}

/** Seconds a switch between players takes to settle. */
const EASE_TIME = 0.4

/**
 * Moves the camera onto the player it follows for a `w`×`h` view (centered a
 * little above their feet, as `followPlayers` frames a solo run), easing after
 * a switch. Call once per drawn frame with the frame's `dt`.
 */
export const updateTeamCamera = (cam: TeamCamera, g: Game, me: Player, w: number, h: number, dt: number) => {
  const target = watched(cam, g, me)
  const follow = target === me ? null : target.slot
  if (follow !== cam.follow) {
    cam.follow = follow
    cam.ease = 1
  }
  const tx = target.x - w / 2
  const ty = target.y - 10 - h / 2
  if (!cam.placed || cam.ease <= 0) {
    cam.x = tx
    cam.y = ty
    cam.placed = true
    cam.ease = 0
    return cam
  }
  cam.ease = Math.max(0, cam.ease - dt / EASE_TIME)
  // Ease-out: covers most of the way at first, settles onto the target as `ease` runs out.
  const k = cam.ease <= 0 ? 1 : 1 - Math.pow(0.0005, dt)
  cam.x += (tx - cam.x) * k
  cam.y += (ty - cam.y) * k
  return cam
}
