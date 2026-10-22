import { describe, expect, it } from 'vitest'
import { addSample, createNetStats, hist, netSummary, noteArrival, noteDraw, noteFrame, quantile } from './netStats'

const TICK_MS = 1000 / 60
const WHERE = { relayColo: 'MIA', relayRegion: 'enam', edgeColo: 'GRU', edgeRtt: 14 }
const RUNNER = { underruns: 0, heals: 0, syncs: 1 }

describe('net stats', () => {
  it('reads quantiles off a fixed histogram, the max past its last bucket', () => {
    const h = hist(1, 100)
    expect(quantile(h, 0.5)).toBeNull()
    for (let v = 0; v < 100; v++) addSample(h, v)
    addSample(h, 900)
    expect(quantile(h, 0.5)).toBe(50.5)
    expect(quantile(h, 0.9)).toBe(90.5)
    expect(quantile(h, 1)).toBe(900)
  })

  it('measures frame jitter from the earliest arrival, split by inputs, and counts stalls', () => {
    const n = createNetStats(1, 0)
    // Frames every tick, 80 ms in flight, every fourth 30 ms late, one 120 ms late (a stall).
    for (let tick = 0; tick < 400; tick++) {
      const late = tick === 200 ? 120 : tick % 4 === 0 ? 30 : 0
      noteArrival(n, tick, 80 + tick * TICK_MS + late, tick % 4 === 0)
    }
    expect(quantile(n.jitter, 0.5)).toBe(0.5)
    expect(quantile(n.jitter, 0.98)).toBe(30.5)
    expect(quantile(n.jitterInputs, 0.5)).toBe(30.5)
    expect(quantile(n.jitterEmpty, 0.9)).toBe(0)
    expect(n.stalls).toBe(1)
  })

  it("doesn't call a slow clock drift jitter over a long run", () => {
    const n = createNetStats(1, 0)
    // The client's clock runs 100 ppm fast: 0.18 s over half an hour.
    for (let tick = 0; tick < 108_000; tick++) noteArrival(n, tick, (80 + tick * TICK_MS) * 1.0001, false)
    expect(quantile(n.jitter, 0.98)).toBeLessThan(3)
  })

  it('weights the hold by time, counts its changes, and sums up per minute of wall time', () => {
    const n = createNetStats(1, 0)
    let now = 0
    for (let i = 0; i < 3600; i++) {
      now += i === 1800 ? 120 : TICK_MS
      noteFrame(n, now, { hold: i < 1800 ? 3 : 6, paused: i >= 3000, catchingUp: false })
    }
    const prediction = { errors: [1, 2, 45], snaps: 1 }
    noteDraw(n, { renderMs: 2, dt: 0.5, shake: true, prediction })
    expect(prediction).toEqual({ errors: [], snaps: 0 })
    const s = netSummary(n, now, RUNNER, WHERE)
    expect(s).toMatchObject({ relayColo: 'MIA', holdMax: 6, long50: 1, long100: 1, displayHz: 60, snaps: 1, predErrMax: 45, wallSec: 60, pauseSec: 10 })
    expect(s.holdMean).toBeCloseTo(4.5, 0)
    expect(s.holdChangesPerMin).toBe(1)
    expect(s.shakeSecPerMin).toBe(0.5)
  })
})
