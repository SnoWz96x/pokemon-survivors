import { describe, expect, it } from 'vitest'
import { CHECKED, checkRank, type BoardLine } from './checkRank'

const line = (board: BoardLine['board'], rank: number | null, mine = true): BoardLine => ({ board, rank, mine })

describe('checkRank', () => {
  it('puts an official attempt first, wherever it stands', () => {
    expect(checkRank({ official: true, lines: [line('global', null)] }, false)).toBe(0)
  })

  it('keeps the best place within the margin of a board, counting only lines that are this run', () => {
    expect(checkRank({ official: false, lines: [line('global', 55), line('starter', 4)] }, false)).toBe(4)
    expect(checkRank({ official: false, lines: [line('global', 61), line('starter', 5)] }, false)).toBeNull()
    // The player's line is a better run of theirs: this one isn't on show.
    expect(checkRank({ official: false, lines: [line('global', 1, false)] }, false)).toBeNull()
  })

  it('draws a run off the boards for the sample only when one is due', () => {
    const off = { official: false, lines: [line('global', 300)] }
    expect(checkRank(off, true)).toBe(CHECKED.sampleRank)
    expect(checkRank({ official: false, lines: [line('global', 12)] }, true)).toBe(12)
  })
})
