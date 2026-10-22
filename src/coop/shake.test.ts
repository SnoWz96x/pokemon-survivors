import { describe, expect, it } from 'vitest'
import { shakeScreen } from '../game/effects'
import { startGame } from './start'
import { NO_RANKS } from '../game/meta'
import type { RunStart } from '../net/protocol'
import { createScreenShake, feelShake, settleShake, type ShakeEvent } from './shake'

const loadout = { starter: 'pichu', ranks: { ...NO_RANKS }, shiny: false } as const
const DUO: RunStart = {
  id: 1,
  seed: 5,
  build: 'test',
  settings: { difficulty: 'normal' },
  players: [
    { seat: 0, name: 'Ana', account: false, loadout },
    { seat: 1, name: 'Bia', account: false, loadout },
  ],
}

const camera = { x: 0, y: 0 }
const view = { w: 320, h: 180 }
const event = (e: Partial<ShakeEvent>): ShakeEvent => ({ kind: 'shake', amount: 3, from: 'own', x: 0, y: 0, actor: 0, ...e })

describe("each co-op screen's own shake", () => {
  it('feels its own player, the team and spots on screen; never a teammate', () => {
    const felt = (e: ShakeEvent) => {
      const s = createScreenShake()
      feelShake(s, e, 1, camera, view)
      return s.amount
    }
    expect(felt(event({ actor: 1, amount: 3 }))).toBe(3)
    expect(felt(event({ actor: 0, amount: 7 }))).toBe(0)
    expect(felt(event({ from: 'team', actor: 0, amount: 9 }))).toBe(9)
    expect(felt(event({ from: 'spot', x: 330, y: 90, amount: 6 }))).toBe(6)
    expect(felt(event({ from: 'spot', x: 600, y: 90, amount: 6 }))).toBe(0)
  })

  it('rolls a new offset only when the run steps, and fades to still', () => {
    const s = createScreenShake()
    feelShake(s, event({ from: 'team', amount: 6 }), 0, camera, view)
    let rolls = 0
    const roll = () => (rolls++ % 2 === 0 ? 0.9 : 0.1)
    settleShake(s, 1 / 120, 10, roll)
    const first = { x: s.x, y: s.y }
    settleShake(s, 1 / 120, 10, roll)
    expect({ x: s.x, y: s.y }).toEqual(first)
    expect(rolls).toBe(2)
    settleShake(s, 1 / 120, 11, roll)
    expect(rolls).toBe(4)
    for (let tick = 12; tick < 60; tick++) settleShake(s, 1 / 60, tick, roll)
    expect([s.amount, s.x, s.y]).toEqual([0, 0, 0])
  })

  it('is told by the simulation in co-op only', () => {
    const g = startGame(DUO)
    g.events.length = 0
    shakeScreen(g, 3)
    shakeScreen(g, 9, { x: 40, y: 50 })
    expect(g.events.filter((e) => e.kind === 'shake')).toEqual([
      { kind: 'shake', amount: 3, from: 'own', x: 0, y: 0 },
      { kind: 'shake', amount: 9, from: 'spot', x: 40, y: 50 },
    ])
    const solo = startGame({ ...DUO, players: DUO.players.slice(0, 1) })
    solo.coop = null
    solo.events.length = 0
    shakeScreen(solo, 5)
    expect([solo.shake, solo.events.length]).toEqual([5, 0])
  })
})
