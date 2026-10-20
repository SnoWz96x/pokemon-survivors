import { describe, expect, it } from 'vitest'
import type { PlayerStats } from '../game/coop'
import { teamAwards } from './teamAwards'

const stats = (slot: number, s: Partial<PlayerStats> = {}): PlayerStats => ({
  slot, starter: 'charmander', level: 10, stage: 1, damage: 0, damageByMove: {}, kills: 0, taken: 0, revives: 0, faints: 0, moves: [{ id: 'ember', level: 3 }], gone: false, ...s,
})

describe('teamAwards', () => {
  it('gives each outright award to its clear best, one per player', () => {
    const awards = teamAwards([
      stats(0, { damage: 900, kills: 50, taken: 100 }),
      stats(1, { damage: 400, kills: 40, revives: 2, taken: 300 }),
      stats(2, { damage: 300, kills: 60, taken: 50, faints: 1 }),
    ])
    expect(awards).toEqual(['damage', 'revives', 'kills'])
  })

  it('never lets a fallback claim a best: a best who already won keeps the award from the others', () => {
    // Slot 0 is best at everything: the others get true fallbacks, never "Mais derrotas".
    const awards = teamAwards([stats(0, { damage: 900, kills: 90, revives: 3, faints: 2 }), stats(1, { damage: 100, kills: 10, faints: 1 }), stats(2, { damage: 50, damageByMove: { ember: 40 }, kills: 5, faints: 1 })])
    expect(awards).toEqual(['damage', 'collector', 'specialist'])
  })

  it('gives a full team of equals four distinct awards', () => {
    // Every outright award ties: each player takes the first fallback left that's true of them, else the first left.
    expect(teamAwards([stats(0), stats(1), stats(2), stats(3)])).toEqual(['survivor', 'collector', 'loyal', 'specialist'])
  })

  it('leaves out players who left and solo runs', () => {
    expect(teamAwards([stats(0, { damage: 50 })])).toEqual([null])
    const awards = teamAwards([stats(0, { damage: 50, taken: 9 }), stats(1, { damage: 999, gone: true }), stats(2, { damage: 10, taken: 5 })])
    expect(awards).toEqual(['damage', null, 'untouched'])
  })
})
