import { moveOf } from '../game/replay'

/**
 * When the stick goes out. Every message the relay receives is billed, and a
 * thumb on a touch stick changes its code (32 directions × 7 levels) nearly
 * every sample, so sending each change cost up to 30 messages a second. Now a
 * change goes out at once when it matters (a start, a stop, a key press, a
 * flick: the stick moved by `STICK.jump`), and a small one (a degree or a step
 * of reach) only once the walk it would have changed adds up to
 * `STICK.drift`: about 1.5 px at walking speed, so a wobbling finger costs a
 * few messages a second and a held one none.
 *
 * The code that went out is the one in play: the client records it as the
 * sample's code, so the sprite's prediction walks exactly what the simulation
 * will (no correction for a wobble the relay never heard). Pure.
 */

export const STICK = {
  /** A change at least this big (|Δ| of the stick vectors, 1 = full reach) goes out at once: 45° at full reach is 0.77. */
  jump: 0.5,
  /** Path drift (full-reach seconds) a small change may build before it goes out: 0.02 s is ~1.5 px at walking speed. */
  drift: 0.02,
  /** Samples between two sends, at least: 30 a second. After a `slow`, twice this and twice the drift. */
  gap: 2,
} as const

/** Samples per second: the drift is summed per sample. */
const SAMPLE_HZ = 60

export type StickPace = {
  /** The code in play (the last one sent), -1 before the first. */
  code: number
  /** The sample it went out with. */
  sample: number
  /** The walk the thumb asked for and the code in play didn't give, since it went out (full-reach seconds). */
  dx: number
  dy: number
}

export const createStickPace = (): StickPace => ({ code: -1, sample: -Infinity, dx: 0, dy: 0 })

/** Sample `sample`'s code: true when it goes out now (it becomes the code in play), false when the one in play stays. */
export const paceStick = (p: StickPace, code: number, sample: number, slow = false): boolean => {
  if (code === p.code) return false
  const want = moveOf(code)
  const have = moveOf(p.code)
  const ex = want.x - have.x
  const ey = want.y - have.y
  p.dx += ex / SAMPLE_HZ
  p.dy += ey / SAMPLE_HZ
  if (sample - p.sample < (slow ? 2 : 1) * STICK.gap) return false
  const startOrStop = p.code <= 0 || code === 0
  if (!startOrStop && Math.hypot(ex, ey) < STICK.jump && Math.hypot(p.dx, p.dy) < (slow ? 2 : 1) * STICK.drift) return false
  p.code = code
  p.sample = sample
  p.dx = 0
  p.dy = 0
  return true
}
