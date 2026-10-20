import { describe, expect, it } from 'vitest'
import type { PlayerStats } from '../game/coop'
import { teamAwards } from './teamAwards'

const stats = (slot: number, s: Partial<PlayerStats> = {}): PlayerStats => ({
  slot, starter: 'charmander', level: 10, stage: 1, damage: 0, damageByMove: {}, kills: 0, taken: 0, revives: 0, faints: 0, moves: [], gone: false, ...s,
})

describe('teamAwards', () => {
  it('gives each award to its clear winner, one per player', () => {
    const awards = teamAwards([
      stats(0, { damage: 900, kills: 50, taken: 100 }),
      stats(1, { damage: 400, kills: 40, revives: 2, taken: 300 }),
      stats(2, { damage: 300, kills: 60, taken: 50, faints: 1 }),
    ])
    // Slot 2 has the most kills, so the next award it would win (least taken) goes to nobody else either.
    expect(awards).toEqual(['damage', 'revives', 'kills'])
  })

  it('skips ties and awards nobody earned', () => {
    expect(teamAwards([stats(0, { damage: 100, taken: 10 }), stats(1, { damage: 100, taken: 10 })])).toEqual([null, null])
  })

  it('leaves out players who left and solo runs', () => {
    expect(teamAwards([stats(0, { damage: 50 })])).toEqual([null])
    expect(teamAwards([stats(0, { damage: 50 }), stats(1, { damage: 999, gone: true }), stats(2, { damage: 10, taken: 5 })])).toEqual(['damage', null, 'tank'])
  })
})
