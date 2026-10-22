import { describe, expect, it } from 'vitest'
import { moveCode } from '../game/replay'
import { createStickPace, paceStick, STICK } from './stickPace'

/** The code of a stick at `deg` degrees and `reach` (0..1). */
const at = (deg: number, reach = 1) => moveCode({ x: Math.cos((deg * Math.PI) / 180) * reach, y: Math.sin((deg * Math.PI) / 180) * reach })

/** Feeds codes from sample `from` on; returns the samples that went out. */
const feed = (p: ReturnType<typeof createStickPace>, codes: number[], from: number, slow = false) =>
  codes.flatMap((code, i) => (paceStick(p, code, from + i, slow) ? [from + i] : []))

describe('the stick pace', () => {
  it('sends a start, a stop and a turn at once, and a held stick never again', () => {
    const p = createStickPace()
    expect(feed(p, [at(0), ...Array(120).fill(at(0))], 1)).toEqual([1])
    // A key turn (45°) and the stop go on their own sample.
    expect(feed(p, [at(45), at(45), at(45)], 200)).toEqual([200])
    expect(feed(p, [0, 0], 300)).toEqual([300])
    expect(p.code).toBe(0)
  })

  it('holds a small change until the walk it changes adds up', () => {
    const p = createStickPace()
    feed(p, [at(0)], 1)
    // One direction step (11.25°): |Δ| ≈ 0.2, so ~0.1 s of it before it goes.
    const step = at(11.25)
    const sent = feed(p, Array(30).fill(step), 10)
    expect(sent).toHaveLength(1)
    expect(sent[0]! - 10).toBeGreaterThan(3)
    expect(sent[0]! - 10).toBeLessThan(10)
    // A finger wobbling around the code in play cancels out and sends far less than once per change.
    const wobble = Array.from({ length: 120 }, (_, i) => (i % 2 ? at(11.25) : at(0)))
    expect(feed(p, wobble, 100).length).toBeLessThan(12)
  })

  it('never sends twice within the gap, and slows down after a slow', () => {
    const p = createStickPace()
    const flail = Array.from({ length: 60 }, (_, i) => at((i % 2) * 180))
    expect(feed(p, flail, 1).length).toBeLessThanOrEqual(60 / STICK.gap)
    const q = createStickPace()
    expect(feed(q, flail, 1, true).length).toBeLessThanOrEqual(60 / (2 * STICK.gap))
  })
})
