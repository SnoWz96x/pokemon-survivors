import { TICK_HZ } from '../net/protocol'

/**
 * The adaptive input hold: how many ticks the client keeps in hand before
 * simulating them, so a frame arriving late doesn't stall the world. Every
 * tick held costs ~17 ms of input latency, so the hold is the lowest that
 * keeps underruns rare: the frames' arrival jitter, measured over the last 10
 * s, at its 98th percentile, plus one tick. It goes up at once (a worse link,
 * an underrun) and down one tick at a time, only after staying lower for a
 * while. A stall (a frame later than `stall` ms: a TCP retransmission, a
 * reconnect) is left out with the whole burst of frames it flushes at once:
 * no hold rides those out, the catch-up does. Pure.
 */

export const HOLD = {
  min: 2,
  max: 10,
  /** Arrivals kept (10 s of live frames). */
  window: 600,
  /** The jitter quantile the hold covers. */
  quantile: 0.98,
  /** A delay past this (ms) is a stall, not jitter. */
  stall: 500,
  /** Frames arriving within this many ms of a stalled one came in its burst. */
  burst: 25,
  /** Ms the target must stay below the hold before it comes down a tick. */
  down: 4000,
  /** The target is recomputed every this many arrivals (it sorts the window). */
  every: 15,
} as const

const TICK_MS = 1000 / TICK_HZ

export type HoldState = {
  /** Ticks held now. */
  hold: number
  /** What the jitter asks for, last computed. */
  target: number
  /** Each arrival's offset: arrival time (ms) minus its tick's place on the run's clock. A ring of `HOLD.window`. */
  offsets: number[]
  next: number
  count: number
  /** Since when (ms) the target sits below the hold, or null. */
  lowerSince: number | null
  /** The earliest offset in the window (ms): the "no delay" line. */
  base: number
  /** When the last stalled frame arrived (ms). */
  stalledAt: number
  underruns: number
  /** The jitter's quantile (ms), for the connection indicator. */
  jitter: number
}

export const createHold = (): HoldState => ({ hold: 4, target: 4, offsets: [], next: 0, count: 0, lowerSince: null, base: Infinity, stalledAt: -Infinity, underruns: 0, jitter: 0 })

/** Forgets the arrivals (after a reconnect or a sync the run's clock may have paused, which shifts every offset). */
export const resetArrivals = (h: HoldState) => {
  h.offsets = []
  h.next = 0
  h.count = 0
  h.base = Infinity
}

/** The ticks the jitter in `offsets` asks for, and that jitter (ms). */
export const holdFor = (offsets: readonly number[]): { ticks: number; jitter: number } => {
  if (offsets.length < 30) return { ticks: 4, jitter: 0 }
  let base = Infinity
  for (const o of offsets) base = Math.min(base, o)
  const delays = offsets.map((o) => o - base).filter((d) => d <= HOLD.stall).sort((a, b) => a - b)
  const q = delays[Math.min(delays.length - 1, Math.floor(delays.length * HOLD.quantile))] ?? 0
  return { ticks: Math.max(HOLD.min, Math.min(HOLD.max, Math.ceil(q / TICK_MS) + 1)), jitter: q }
}

/** A live frame whose last tick is `tick` arrived at `at` (ms, the client's clock). */
export const onArrival = (h: HoldState, tick: number, at: number) => {
  const offset = at - tick * TICK_MS
  if (offset - h.base > HOLD.stall) h.stalledAt = at
  if (at - h.stalledAt < HOLD.burst) return
  h.base = Math.min(h.base, offset)
  if (h.offsets.length < HOLD.window) h.offsets.push(offset)
  else h.offsets[h.next] = offset
  h.next = (h.next + 1) % HOLD.window
  if (++h.count % HOLD.every !== 0) return
  const { ticks, jitter } = holdFor(h.offsets)
  h.base = Math.min(...h.offsets)
  h.target = ticks
  h.jitter = jitter
}

/** Moves the hold toward the target: up at once, down a tick after `HOLD.down` ms below it. */
export const updateHold = (h: HoldState, now: number) => {
  if (h.target > h.hold) {
    h.hold = h.target
    h.lowerSince = null
  } else if (h.target < h.hold) {
    h.lowerSince ??= now
    if (now - h.lowerSince >= HOLD.down) {
      h.hold--
      h.lowerSince = now
    }
  } else h.lowerSince = null
}

/** The buffer ran dry while live: one more tick at once, and the target can't ask for less for a while. */
export const onUnderrun = (h: HoldState, now: number) => {
  h.underruns++
  h.hold = Math.min(HOLD.max, h.hold + 1)
  h.target = Math.max(h.target, h.hold)
  h.lowerSince = now
}
