import { describe, expect, it } from 'vitest'
import {
  CHAIN_FALLOFF, chainDamage, chainTargets, LUNGE_IFRAMES, LUNGE_MAX, LUNGE_MIN_COOLDOWN, lungeLength, lungeStep, lungeTarget,
  MINE_ARM, mineArmed, mineBlast, mineCap,
} from './moveRules'
import { createGame, step } from './game'
import { maxMoveLevel, moveStats } from './moves'
import { BASE_STATS } from './stats'

const foe = (id: number, x: number, y: number, dying = -1) => ({ id, x, y, dying })
const ORIGIN = { x: 0, y: 0 }

describe('lunge', () => {
  it('never cools down faster than the floor, and its i-frames always end before it can fire again', () => {
    const hasted = { ...BASE_STATS, cooldown: 0.2 }
    for (const id of ['quickAttack', 'extremeSpeed'] as const) {
      const s = moveStats(id, maxMoveLevel(id), hasted)
      expect(s.cooldown).toBe(LUNGE_MIN_COOLDOWN)
    }
    expect(LUNGE_IFRAMES).toBeLessThan(LUNGE_MIN_COOLDOWN / 2)
    // Other moves keep their usual floor.
    expect(moveStats('ember', 1, hasted).cooldown).toBeLessThan(LUNGE_MIN_COOLDOWN)
  })

  it('waits for the press, then hops ahead even with no foe in reach', () => {
    const g = createGame('riolu', { w: 480, h: 270 }, 1)
    g.player.moves = [{ id: 'quickAttack', level: 1, cooldown: 0 }]
    g.enemies.length = 0
    const right = { x: 1, y: 0 }
    for (let i = 0; i < 120; i++) step(g, { move: right, special: false }, 1 / 60)
    expect(g.attacks.some((a) => a.move === 'quickAttack')).toBe(false)
    step(g, { move: right, special: false, lunge: true }, 1 / 60)
    expect(g.attacks.some((a) => a.move === 'quickAttack')).toBe(true)
    expect(g.player.moves[0]!.cooldown).toBeGreaterThan(1)
  })

  it('caps its length however fast it gets', () => {
    expect(lungeLength(360)).toBeCloseTo(50.4)
    expect(lungeLength(5000)).toBe(LUNGE_MAX)
  })

  it('goes for the nearest foe in reach, any direction while standing still', () => {
    const foes = [foe(1, 60, 0), foe(2, -30, 0), foe(3, 200, 0)]
    expect(lungeTarget(foes, ORIGIN, { x: 1, y: 0 }, false, 80)?.id).toBe(2)
    expect(lungeTarget([foe(3, 200, 0)], ORIGIN, { x: 1, y: 0 }, false, 80)).toBeNull()
  })

  it('only lunges ahead of the stick while walking, never back against it', () => {
    const foes = [foe(1, 60, 0), foe(2, -30, 0), foe(4, 10, 40)]
    expect(lungeTarget(foes, ORIGIN, { x: 1, y: 0 }, true, 80)?.id).toBe(1)
    expect(lungeTarget([foe(2, -30, 0), foe(4, 10, 40)], ORIGIN, { x: 1, y: 0 }, true, 80)).toBeNull()
  })

  it('skips fainting foes and breaks ties by id', () => {
    expect(lungeTarget([foe(9, 20, 0), foe(5, 0, 20), foe(1, 5, 0, 0.1)], ORIGIN, { x: 1, y: 0 }, false, 80)?.id).toBe(5)
  })

  it('carries its caster v × its time, then stops', () => {
    const m = { vx: 300, vy: -100, left: 0.05 }
    let x = 0
    for (let i = 0; i < 6; i++) {
      const step = lungeStep(m, 1 / 60)
      m.left = step.left
      x += step.dx
    }
    expect(m.left).toBe(0)
    expect(x).toBeCloseTo(300 * 0.05, 9)
  })
})

describe('chain', () => {
  it('jumps to the next nearest unhit foe within reach of the last one', () => {
    const foes = [foe(1, 50, 0), foe(2, 120, 0), foe(3, 60, 30), foe(4, 400, 0)]
    expect(chainTargets(foes, ORIGIN, 5, 200, 90).map((e) => e.id)).toEqual([1, 3, 2])
  })

  it('stops at `count` and only starts on a foe within range', () => {
    const foes = [foe(1, 50, 0), foe(2, 100, 0), foe(3, 150, 0)]
    expect(chainTargets(foes, ORIGIN, 2, 200, 90).map((e) => e.id)).toEqual([1, 2])
    expect(chainTargets(foes, ORIGIN, 5, 40, 90)).toEqual([])
  })

  it('picks the same order whatever the list order, breaking ties by id', () => {
    const foes = [foe(7, 0, 50), foe(3, 50, 0), foe(5, -50, 0)]
    const order = chainTargets(foes, ORIGIN, 3, 200, 200).map((e) => e.id)
    expect(order[0]).toBe(3)
    expect(chainTargets([...foes].reverse(), ORIGIN, 3, 200, 200).map((e) => e.id)).toEqual(order)
  })

  it('loses 15% per jump and hits afflicted foes ×1.7 with Hex', () => {
    expect(chainDamage(100, 0)).toBe(100)
    expect(chainDamage(100, 2)).toBeCloseTo(100 * CHAIN_FALLOFF * CHAIN_FALLOFF)
  })
})

describe('mines', () => {
  it('arm after a short delay', () => {
    expect(mineArmed(0)).toBe(false)
    expect(mineArmed(MINE_ARM - 0.01)).toBe(false)
    expect(mineArmed(MINE_ARM)).toBe(true)
  })

  it('blow for full damage when stepped on and half when they expire', () => {
    expect(mineBlast(40, false)).toBe(40)
    expect(mineBlast(40, true)).toBe(20)
  })

  it('cap the active mines at 4 plus 2 per extra mine a cast drops', () => {
    expect(mineCap(1)).toBe(4)
    expect(mineCap(2)).toBe(6)
    expect(mineCap(3)).toBe(8)
  })
})
