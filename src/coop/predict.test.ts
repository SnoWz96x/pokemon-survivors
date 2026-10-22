import { describe, expect, it } from 'vitest'
import { autoPick } from '../game/lockstep'
import { NO_RANKS } from '../game/meta'
import { moveCode } from '../game/replay'
import type { RunStart } from '../net/protocol'
import { HISTORY } from './client'
import { createPrediction, createSteadyOffset, predict, steadyOffset } from './predict'
import { createRunner, onFrame, stepOne, type RunnerDeps } from './runner'

const START: RunStart = {
  id: 1,
  seed: 77,
  build: 'test',
  settings: { difficulty: 'normal' },
  players: [{ seat: 0, name: 'Ana', account: false, loadout: { starter: 'pichu', ranks: { ...NO_RANKS }, shiny: false } }],
}

const deps: RunnerDeps = { send: () => {}, now: () => 0 }

/** A run walking right, its stick stamped at tick 0 (sample 0), 60 ticks in; every later sample keeps walking right. */
const walkingRight = () => {
  const r = createRunner(START, 'ROOMS', 0)
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
  it('eases instead of snapping back when the step stops walking the player (a hitstop, a held world)', () => {
    const { r, history } = walkingRight()
    const pr = createPrediction()
    // 20 samples ahead of the confirmed state.
    const ahead = predict(pr, r, history, 79, 0, 1 / 60)
    const snap = ahead.x - r.game.player.x
    expect(snap).toBeGreaterThan(10)
    // A frame moves the sprite a step or two (a blend), never the whole way back.
    r.game.hitstop = 0.2
    const hit = predict(pr, r, history, 80, 0, 1 / 60)
    expect(Math.abs(hit.x - ahead.x)).toBeLessThan(snap / 4)
    r.game.hitstop = 0
    r.game.phase = 'levelup'
    const held = predict(pr, r, history, 81, 0, 1 / 60)
    expect(Math.abs(held.x - hit.x)).toBeLessThan(snap / 4)
    // Held long enough, it settles on the confirmed spot.
    let last = held
    for (let s = 82; s < 140; s++) last = predict(pr, r, history, s, 0, 1 / 60)
    expect(Math.abs(last.x - r.game.player.x)).toBeLessThan(0.5)
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
