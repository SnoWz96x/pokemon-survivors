import { describe, expect, it } from 'vitest'
import { autoPick } from '../game/lockstep'
import { NO_RANKS } from '../game/meta'
import { moveCode } from '../game/replay'
import type { PlayableId } from '../data/hatchlings'
import type { RunStart } from '../net/protocol'
import { HISTORY } from './client'
import { createPrediction, createSteadyOffset, predict, settle, SETTLE_WALKS, SNAP, steadyOffset } from './predict'
import { createRunner, onFrame, stepOne, type Runner, type RunnerDeps } from './runner'

const startWith = (starter: PlayableId): RunStart => ({
  id: 1,
  seed: 77,
  build: 'test',
  settings: { difficulty: 'normal' },
  players: [{ seat: 0, name: 'Ana', account: false, loadout: { starter, ranks: { ...NO_RANKS }, shiny: false } }],
})

const deps: RunnerDeps = { send: () => {}, now: () => 0 }

/** A run walking right, its stick stamped at tick 0 (sample 0), 60 ticks in; every later sample keeps walking right. */
const walkingRight = (starter: PlayableId = 'pichu') => {
  const r = createRunner(startWith(starter), 'ROOMS', 0)
  const g = r.game
  for (const p of g.players) autoPick(g, p)
  g.enemies.length = 0
  g.nextEvent = Infinity
  g.spawnBudget = -1e9
  const code = moveCode({ x: 1, y: 0 })
  onFrame(r, { t: 'frame', from: 0, to: 60, ticks: [[0, [[0, 'move', code, 0]]]] }, 0, () => {})
  while (r.next < 60) stepOne(r, deps)
  return { r, history: new Uint8Array(HISTORY).fill(code) }
}

describe('own-movement prediction', () => {
  it('eases instead of snapping back when the step stops walking the player (a held world)', () => {
    const { r, history } = walkingRight()
    const pr = createPrediction()
    // 20 samples ahead of the confirmed state.
    const ahead = predict(pr, r, { history, sample: 79, specials: [] }, 0, 1 / 60)
    const snap = ahead.x - r.game.player.x
    expect(snap).toBeGreaterThan(10)
    // A frame moves the sprite a step or two (a blend), never the whole way back.
    r.game.phase = 'levelup'
    const held = predict(pr, r, { history, sample: 80, specials: [] }, 0, 1 / 60)
    expect(Math.abs(held.x - ahead.x)).toBeLessThan(snap / 4)
    // Held long enough, it settles on the confirmed spot.
    let last = held
    for (let s = 81; s < 140; s++) last = predict(pr, r, { history, sample: s, specials: [] }, 0, 1 / 60)
    expect(Math.abs(last.x - r.game.player.x)).toBeLessThan(0.5)
  })
})

/** Receives the frames up to `to` (this player's special pressed at tick and sample `press`, if inside) and simulates them. */
const runTo = (r: Runner, to: number, press: number) => {
  onFrame(r, { t: 'frame', from: r.known, to, ticks: press >= r.known && press < to ? [[press, [[0, 'special', press]]]] : [] }, 0, () => {})
  while (r.next < to) stepOne(r, deps)
}

describe('own-motion prediction of the special', () => {
  // Charmander's Flare Blitz dashes after its wind-up; Riolu's chain jumps at once (ahead, with no foe in reach).
  it.each(['charmander', 'riolu'] as const)('moves %s where the run will, from the press on, without pressing twice', (starter) => {
    const { r, history } = walkingRight(starter)
    const pr = createPrediction()
    const press = 62
    const own = (sample: number) => ({ history, sample, specials: [press] })
    // The press went out at sample 62; the confirmed state is at 59 and hasn't seen it.
    const walkOnly = predict(createPrediction(), r, { history, sample: 104, specials: [] }, 0, 1 / 60)
    const dashed = predict(pr, r, own(104), 0, 1 / 60)
    expect(dashed.x - walkOnly.x).toBeGreaterThan(40)
    // The run takes the press at its tick and lands on the predicted spot.
    runTo(r, 104, press)
    expect(r.pressed).toBe(press)
    expect(r.game.player.x).toBeCloseTo(dashed.x, 6)
    expect(r.game.player.y).toBeCloseTo(dashed.y, 6)
    // Taken, the press isn't pressed again: still on the spot the run reaches.
    const later = predict(pr, r, own(140), 0, 1 / 60)
    runTo(r, 140, press)
    expect(r.game.player.x).toBeCloseTo(later.x, 6)
    expect(pr.snaps).toBe(0)
  })

  it('shows the charge on the drawn player at once', () => {
    const { r, history } = walkingRight('charmander')
    const pr = createPrediction()
    predict(pr, r, { history, sample: 62, specials: [61] }, 0, 1 / 60)
    expect(r.game.player.special.charge).toBe(0)
    expect(pr.look?.special.charge).toBeGreaterThan(0)
  })
})

describe('corrections', () => {
  it('shrink by at least 1.5× the walking speed a second, and end', () => {
    const walk = 70
    for (const size of [0.5, 3, 12, 35]) {
      const err = { x: size * 0.6, y: size * 0.8 }
      settle(err, 1 / 60, walk)
      expect(Math.hypot(err.x, err.y)).toBeLessThanOrEqual(Math.max(0, size - (SETTLE_WALKS * walk) / 60) + 1e-9)
    }
    const err = { x: 30, y: 0 }
    let frames = 0
    for (; err.x > 0; frames++) settle(err, 1 / 60, walk)
    expect(frames).toBeLessThan(30)
  })

  it('glide however big a misprediction is, and snap only for a teleport', () => {
    const { r, history } = walkingRight()
    const pr = createPrediction()
    predict(pr, r, { history, sample: 70, specials: [] }, 0, 1 / 60)
    // Two ticks on, the run is 60 px off the prediction (a jump aimed at a foe that moved): a correction, not a snap.
    runTo(r, 62, -1)
    r.game.player.x += 60
    const off = predict(pr, r, { history, sample: 72, specials: [] }, 0, 1 / 60)
    expect(pr.snaps).toBe(0)
    expect(Math.abs(pr.err.x)).toBeGreaterThan(SNAP)
    // 300 px in no time: a teleport.
    r.game.player.x += 300
    const moved = predict(pr, r, { history, sample: 72, specials: [] }, 0, 1 / 60)
    expect(pr.snaps).toBe(1)
    expect(moved.x - off.x).toBeGreaterThan(300)
  })
})

describe('the steady sample ↔ tick offset', () => {
  it('holds still while each anchor’s trip jitters, so a stick held still predicts one smooth path', () => {
    const s = createSteadyOffset()
    const seen = new Set<number>()
    // Anchors every 15 ticks, each stamped 0–2 ticks late (±17 ms of jitter on the way up).
    for (let k = 0; k < 40; k++) seen.add(steadyOffset(s, { tick: 100 + k * 15, sample: 250 + k * 15 - ((k * 7) % 3) }))
    expect(seen.size).toBeLessThanOrEqual(2)
  })

  it('ignores one anchor held up behind a long frame, and moves at once when the next agrees (a reconnect)', () => {
    const s = createSteadyOffset()
    for (let k = 0; k < 10; k++) steadyOffset(s, { tick: k * 10, sample: k * 10 + 150 })
    expect(steadyOffset(s, { tick: 100, sample: 100 + 136 })).toBe(150)
    expect(steadyOffset(s, { tick: 110, sample: 110 + 150 })).toBe(150)
    steadyOffset(s, { tick: 120, sample: 120 + 120 })
    expect(steadyOffset(s, { tick: 130, sample: 130 + 121 })).toBe(121)
  })
})
