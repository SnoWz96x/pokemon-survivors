import { describe, expect, it } from 'vitest'
import { NO_RANKS } from '../game/meta'
import { stateHash } from '../game/snapshot'
import type { ClientMessage, Entry, Frame, RunStart } from '../net/protocol'
import { advance, createRunner, onFrame, SYNC_FAR, type RunnerDeps } from './runner'

const START: RunStart = {
  id: 1,
  seed: 4242,
  build: 'test',
  settings: { difficulty: 'normal' },
  players: [
    { seat: 0, name: 'Ana', account: false, loadout: { starter: 'pichu', ranks: { ...NO_RANKS }, shiny: false } },
    { seat: 2, name: 'Bia', account: false, loadout: { starter: 'gible', ranks: { ...NO_RANKS }, shiny: false } },
  ],
}

const frame = (from: number, to: number, ticks: [number, Entry[]][] = []): Frame => ({ t: 'frame', from, to, ticks })

/** A clock the test moves; `cost` ms pass on every reading too (a tick's CPU time, for the budget). */
const harness = (cost = 0) => {
  let now = 0
  const sent: ClientMessage[] = []
  const deps: RunnerDeps = { send: (m) => void sent.push(m), now: () => (now += cost) }
  return { deps, sent, tick: (ms: number) => (now += ms), at: () => now }
}

/** The stick of a seat, held from tick `t`: the same entries for everyone. */
const sticks = (t: number): [number, Entry[]][] => (t % 40 === 0 ? [[t, [[0, 'move', (t / 40) % 225, 0], [2, 'move', (t / 40 + 9) % 225, 0]]]] : [])

describe('the lockstep runner', () => {
  it('maps seats to slots and lands two clients on the same state, hashing once a second', () => {
    const h = harness()
    const a = createRunner(START, 'ROOMS', 0)
    const b = createRunner(START, 'ROOMS', 2)
    expect(b.slot).toBe(1)
    for (let t = 0; t < 600; t++) {
      for (const r of [a, b]) onFrame(r, frame(t, t + 1, sticks(t)), h.at(), () => {})
      h.tick(1000 / 60)
      advance(a, 1 / 60, h.deps)
      advance(b, 1 / 60, h.deps)
    }
    // Both stepped everything but their hold.
    expect(a.next).toBeGreaterThan(590)
    while (a.next < 600) advance(a, 1 / 60, h.deps)
    while (b.next < 600) advance(b, 1 / 60, h.deps)
    expect(stateHash(a.game)).toBe(stateHash(b.game))
    expect(h.sent.filter((m) => m.t === 'hash').length).toBe(20)
  })

  it('keeps its hold in hand, and catches up smoothly when behind: faster, never all at once', () => {
    const h = harness()
    const r = createRunner(START, 'ROOMS', 0)
    // 120 ticks arrive at once (a stall flushing): too few to sync, so it catches up a few extra per frame.
    onFrame(r, frame(0, 120), h.at(), () => {})
    const runs: number[] = []
    for (let i = 0; i < 60; i++) {
      h.tick(1000 / 60)
      runs.push(advance(r, 1 / 60, h.deps))
    }
    expect(Math.max(...runs)).toBeLessThanOrEqual(3)
    expect(runs.reduce((a, b) => a + b, 0)).toBeGreaterThan(60)
    expect(r.syncing).toBeNull()
    // Never runs into the hold while live frames keep coming.
    expect(r.known - r.next).toBeGreaterThanOrEqual(0)
  })

  it('syncs when far behind: as fast as the budget allows, with progress', () => {
    const h = harness(0.4)
    const r = createRunner(START, 'ROOMS', 0)
    onFrame(r, frame(0, SYNC_FAR * 3), h.at(), () => {})
    h.tick(16)
    const first = advance(r, 1 / 60, h.deps)
    expect(r.syncing).not.toBeNull()
    expect(first).toBeLessThan(SYNC_FAR)
    for (let i = 0; i < 2000 && r.syncing; i++) advance(r, 1 / 60, h.deps)
    expect(r.syncing).toBeNull()
    expect(r.known - r.next).toBeLessThanOrEqual(r.hold.hold + 2)
  })

  it('says a gap in the frames (the caller resyncs)', () => {
    const h = harness()
    const r = createRunner(START, 'ROOMS', 0)
    expect(onFrame(r, frame(0, 10), h.at(), () => {})).toBe(true)
    expect(onFrame(r, frame(5, 12), h.at(), () => {})).toBe(true)
    expect(r.known).toBe(12)
    expect(onFrame(r, frame(20, 21), h.at(), () => {})).toBe(false)
  })
})
