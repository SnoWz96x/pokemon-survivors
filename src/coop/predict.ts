import { worldHeld } from '../game/coop'
import { walkPlayer } from '../game/game'
import { inPlay, localPlayer } from '../game/players'
import { moveOf, TICK } from '../game/replay'
import { keepOut } from '../game/terrain'
import type { Game, Player } from '../game/types'
import { HISTORY } from './client'
import type { Runner } from './runner'

/**
 * Own-movement prediction, draw-only. The simulation learns about this
 * player's stick a round trip and a hold later; meanwhile the sprite walks
 * where the stick already took it: the real movement step (`walkPlayer`:
 * water, ice, the special's pace) and the real terrain (`keepOut`: rocks,
 * cliffs, lake shores, an arena's walls), run on a copy of the player from
 * the confirmed state through every input sample not simulated yet. A copy
 * of the game holds it, with its own terrain cache, so the simulation's state
 * is never touched. When the confirmed state disagrees with what was
 * predicted (a knockback, a dash, a hit), the difference blends away over a
 * few frames instead of snapping; the drawn spot is kept out of the terrain
 * too, so the sprite never sinks into a wall. While the step doesn't walk the
 * player (the rift's fall, a held world) the sprite eases to the confirmed
 * spot the same way. A hitstop never stops it: co-op plays on through one.
 *
 * Each frame: the steady offset (`steadyOffset`) says which sample the
 * confirmed state has reached (`simSample`); `walking` says whether the next
 * ticks walk the stick; `walkAhead` walks the ghost from there to the
 * latest sample; the change against last frame's prediction for the same
 * sample is the correction (`err`), faded over `BLEND`. Only walking is
 * modelled: a dash, lunge or roll moves the confirmed player on its own and
 * reaches the sprite as a correction.
 */

/** Samples predicted ahead at most (~0.75 s): a worse link just shows its lag. */
export const MAX_AHEAD = 45

/** Seconds a correction takes to fade to a third. */
const BLEND = 0.08

/** A correction past this (px) is a teleport (a rift, a restore): it snaps. */
const SNAP = 40

type Pos = { x: number; y: number }

export type Prediction = {
  /** The drawn spot of this player, this frame. */
  drawn: Pos
  /** The correction still being blended away. */
  err: Pos
  /** The prediction made for each input sample, to compare with the confirmed state once it gets there. */
  predicted: Float64Array
  predictedAt: Int32Array
  lastSample: number
  last: Pos
  ghost: Player | null
  world: Game | null
  terrain: Game['terrain']
  /** |predicted − confirmed| (px) each time the confirmed state reaches a predicted sample (the PR's numbers). */
  errors: number[]
  /** Which stick sample each tick reads, kept steady across anchors (`steadyOffset`). */
  offset: SteadyOffset
}

/**
 * Which of this client's stick samples the run's ticks read: tick `t` reads
 * sample `t + offset` (both count 60 a second). Each anchor (this player's
 * last stick input the relay stamped) says it once, jittered by that
 * message's trip; `steadyOffset` keeps one that holds still.
 */
export type SteadyOffset = {
  /** The offset in use (sample − tick), null before the first anchor. */
  offset: number | null
  /** The last anchors' raw offsets (`OFFSETS` of them), oldest first. */
  recent: number[]
  /** The tick of the last anchor read (an anchor counts once). */
  anchor: number
  /** Anchors in a row whose median asked for another offset. */
  votes: number
  /** The last raw offset that sat `OFFSET_JUMP` off, waiting for a second to agree. */
  far: number | null
}

/** Anchors whose raw offsets the steady one is the median of. */
const OFFSETS = 9

/** Anchors in a row the median must ask for another offset before it moves (one-sample wobbles stay put). */
const OFFSET_VOTES = 3

/** An anchor this far (samples) off is an outlier, or, when the next one agrees, a new clock (a reconnect, a long pause). */
const OFFSET_JUMP = 8

/** Two far anchors this close (samples) agree. */
const OFFSET_AGREE = 2

export const createSteadyOffset = (): SteadyOffset => ({ offset: null, recent: [], anchor: -1, votes: 0, far: null })

/**
 * The steady sample ↔ tick offset after an anchor. Taken raw, every new
 * anchor (one each stick change, and every 250 ms) shifted the whole
 * prediction by its trip's jitter: 3.7 corrections a second of 1 to 3 px
 * blended into the sprite and the camera, and 8 to 14 px when a long frame
 * held the send. The median of the last few, moved only after a few anchors
 * in a row ask for it, holds still: a stick held still predicts the same path
 * whatever each trip took. A single anchor far off is ignored; two that agree
 * move it at once (the clocks really moved).
 */
export const steadyOffset = (s: SteadyOffset, anchor: { tick: number; sample: number }): number => {
  const raw = anchor.sample - anchor.tick
  const was = s.offset
  if (was !== null && anchor.tick === s.anchor) return was
  s.anchor = anchor.tick
  const far = was !== null && Math.abs(raw - was) > OFFSET_JUMP
  if (far && (s.far === null || Math.abs(raw - s.far) > OFFSET_AGREE)) {
    s.far = raw
    return was
  }
  s.far = null
  if (was === null || far) {
    s.offset = raw
    s.recent = [raw]
    s.votes = 0
    return raw
  }
  s.recent.push(raw)
  if (s.recent.length > OFFSETS) s.recent.shift()
  const median = [...s.recent].sort((a, b) => a - b)[s.recent.length >> 1]!
  s.votes = median === was ? 0 : s.votes + 1
  if (s.votes < OFFSET_VOTES) return was
  s.votes = 0
  s.offset = median
  return median
}

export const createPrediction = (): Prediction => ({
  drawn: { x: 0, y: 0 },
  err: { x: 0, y: 0 },
  predicted: new Float64Array(HISTORY * 2),
  predictedAt: new Int32Array(HISTORY).fill(-1),
  lastSample: -1,
  last: { x: 0, y: 0 },
  ghost: null,
  world: null,
  terrain: { seed: 0, cells: new Map() },
  errors: [],
  offset: createSteadyOffset(),
})

/**
 * Whether the next steps walk this player with their stick, mirroring the
 * step's own checks: not while a screen is up, the world is held, the rift's
 * fall or a wave legendary's scene plays, or they're fainted or wrapped up.
 */
const walking = (g: Game, p: Player) =>
  g.phase === 'playing' && inPlay(p) && !worldHeld(g) && (g.rift.arena?.fall ?? null) === null && g.legendScene === null

/**
 * Walks a copy of the confirmed player through the samples after `from` up
 * to `sample`, against the terrain. Returns the positions at `sample - 1`,
 * `sample` and `at` (the start for `at <= from`, null past `sample`).
 */
const walkAhead = (pr: Prediction, g: Game, p: Player, history: Uint8Array, from: number, sample: number, at: number) => {
  const ghost = Object.assign((pr.ghost ??= { ...p }), p)
  if (pr.terrain.seed !== g.terrain.seed) pr.terrain = { seed: g.terrain.seed, cells: new Map() }
  if (pr.terrain.cells.size > 4096) pr.terrain.cells.clear()
  // A copy of the game around the copy of the player, with its own terrain cache: the step reads `g.player`.
  const world = Object.assign((pr.world ??= { ...g }), g, { player: ghost, terrain: pr.terrain })
  let prev = { x: ghost.x, y: ghost.y }
  let atPos: Pos | null = at <= from ? { x: ghost.x, y: ghost.y } : null
  for (let s = from + 1; s <= sample; s++) {
    if (s === sample) prev = { x: ghost.x, y: ghost.y }
    walkPlayer(world, moveOf(history[s % HISTORY]!), TICK)
    keepOut(world, ghost, ghost.radius)
    if (s === at) atPos = { x: ghost.x, y: ghost.y }
  }
  return { prev, cur: { x: ghost.x, y: ghost.y }, at: atPos }
}

/**
 * Where to draw this client's player this frame. `sample` is the stick's
 * latest input sample, `frac` how far real time is into the next one, `dt`
 * the frame's seconds.
 */
export const predict = (pr: Prediction, r: Runner, history: Uint8Array, sample: number, frac: number, dt: number): Pos => {
  const g = r.game
  const p = localPlayer(g)
  const anchor = r.anchor
  let cur: Pos = { x: p.x, y: p.y }
  let prev: Pos = cur
  let atLast: Pos | null = null
  let walked = false
  if (anchor && walking(g, p)) {
    // Ticks and samples both count 60 a second: tick `t` reads the sample `t + offset`.
    const simSample = steadyOffset(pr.offset, anchor) + r.next - 1
    // How good the prediction was for the sample the confirmed state just reached.
    const k = ((simSample % HISTORY) + HISTORY) % HISTORY
    if (pr.predictedAt[k] === simSample && pr.errors.length < 100_000) pr.errors.push(Math.hypot(pr.predicted[k * 2]! - p.x, pr.predicted[k * 2 + 1]! - p.y))
    const from = Math.min(simSample, sample)
    const ahead = Math.max(0, Math.min(MAX_AHEAD, sample - from))
    const w = walkAhead(pr, g, p, history, from, from + ahead, pr.lastSample)
    cur = w.cur
    prev = ahead > 0 ? w.prev : cur
    atLast = w.at
    walked = true
    const top = ((sample % HISTORY) + HISTORY) % HISTORY
    pr.predicted[top * 2] = cur.x
    pr.predicted[top * 2 + 1] = cur.y
    pr.predictedAt[top] = sample
  }
  // The confirmed state moved what was predicted for last frame's sample: blend the difference away. Not
  // walking, the confirmed spot stands for every sample: the sprite eases onto it instead of snapping back.
  if (pr.lastSample >= 0) {
    const was = pr.last
    const now = walked ? (atLast ?? (pr.lastSample === sample ? cur : null)) : cur
    if (now) {
      pr.err.x += was.x - now.x
      pr.err.y += was.y - now.y
    }
  }
  if (Math.hypot(pr.err.x, pr.err.y) > SNAP) pr.err = { x: 0, y: 0 }
  const fade = Math.exp(-dt / BLEND)
  pr.err.x *= fade
  pr.err.y *= fade
  pr.last = cur
  pr.lastSample = sample
  const drawn = { x: prev.x + (cur.x - prev.x) * frac + pr.err.x, y: prev.y + (cur.y - prev.y) * frac + pr.err.y }
  // The blend never draws the sprite inside a wall.
  if (walked && pr.world) keepOut(pr.world, drawn, p.radius)
  pr.drawn = drawn
  return drawn
}
