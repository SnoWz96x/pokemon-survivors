import { describe, expect, it } from 'vitest'
import { commitArrivals, createHold, HOLD, holdFor, onArrival, onUnderrun, updateHold } from './hold'

const TICK_MS = 1000 / 60

/**
 * Feeds `n` live frames, one tick each, arriving `delay(i)` ms after their tick's place on the clock. A display frame
 * of `frame(i)` s begins after each (null: none, the page is busy and the frames wait for the next).
 */
const feed = (delay: (i: number) => number, n = HOLD.window, from = 0, frame: (i: number) => number | null = () => 1 / 60) => {
  const h = createHold()
  for (let i = from; i < from + n; i++) {
    onArrival(h, i, 5000 + i * TICK_MS + delay(i))
    const dt = frame(i)
    if (dt !== null) commitArrivals(h, dt)
  }
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

  it('leaves out the frames read during a long display frame: they waited on the page, not the network', () => {
    // Every 2 s the page is busy for ~200 ms (a level-up screen, a GC): the frames it held come in 200 ms late.
    const busy = (i: number) => i % 120 >= 108
    const late = feed((i) => (busy(i) ? (120 - (i % 120)) * TICK_MS : 2), HOLD.window, 0, (i) => (busy(i) ? (i % 120 === 119 ? 0.2 : null) : 1 / 60))
    expect(holdFor(late.offsets).ticks).toBe(HOLD.min)
  })

  it('counts a bunch of frames read back to back once: its first carries the delay', () => {
    // Every 2 s a frame comes 150 ms late with the 9 behind it: read together, they'd be 10 late arrivals of 60.
    const h = createHold()
    for (let i = 0; i < HOLD.window; i++) {
      const k = i % 120
      onArrival(h, i, 5000 + (k < 10 ? (i - k + 9) * TICK_MS + 150 - 9 * TICK_MS : i * TICK_MS + 2))
      commitArrivals(h, 1 / 60)
    }
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
