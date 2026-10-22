import { describe, expect, it } from 'vitest'
import { createHold, HOLD, holdFor, onArrival, onUnderrun, updateHold } from './hold'

const TICK_MS = 1000 / 60

/** Feeds `n` live frames, one tick each, arriving `delay(i)` ms after their tick's place on the clock. */
const feed = (delay: (i: number) => number, n = HOLD.window, from = 0) => {
  const h = createHold()
  for (let i = from; i < from + n; i++) onArrival(h, i, 5000 + i * TICK_MS + delay(i))
  return h
}

describe('the adaptive hold', () => {
  it('holds the minimum on a steady link', () => {
    expect(holdFor(feed(() => 3).offsets).ticks).toBe(HOLD.min)
  })

  it('covers the jitter at its 98th percentile, plus a tick', () => {
    // ±40 ms of uniform jitter: an 80 ms spread, about 5 ticks, plus one.
    let s = 7
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const { ticks, jitter } = holdFor(feed(() => rand() * 80).offsets)
    expect(jitter).toBeGreaterThan(70)
    expect(ticks).toBe(Math.ceil(jitter / TICK_MS) + 1)
    expect(ticks).toBeLessThanOrEqual(HOLD.max)
  })

  it('leaves stalls out: a 3 s TCP stall is the catch-up’s job, not the hold’s', () => {
    const h = feed((i) => (i >= 300 && i < 480 ? (480 - i) * TICK_MS + 3000 - 180 * TICK_MS : 2))
    expect(holdFor(h.offsets).ticks).toBe(HOLD.min)
  })

  it('goes up at once and comes down a tick at a time, only after a while', () => {
    const h = createHold()
    h.hold = 3
    h.target = 8
    updateHold(h, 0)
    expect(h.hold).toBe(8)
    h.target = 3
    updateHold(h, 100)
    updateHold(h, 100 + HOLD.down - 1)
    expect(h.hold).toBe(8)
    updateHold(h, 100 + HOLD.down)
    expect(h.hold).toBe(7)
    updateHold(h, 100 + HOLD.down * 2)
    expect(h.hold).toBe(6)
  })

  it('takes one more tick on an underrun, capped', () => {
    const h = createHold()
    h.hold = HOLD.max - 1
    onUnderrun(h, 0)
    onUnderrun(h, 1)
    expect(h.hold).toBe(HOLD.max)
    expect(h.underruns).toBe(2)
  })
})
