import { describe, expect, it } from 'vitest'
import type { CoopPayout } from '../game/coop'
import type { RunSummary } from '../game/tally'
import { bank, bankDelta, bankKey, loadBanked, NOTHING_BANKED, type Store } from './bank'

const summary = { kills: 10 } as unknown as RunSummary

const payout = (coins: number, steps: number, eggs: number, bonus = 50): CoopPayout => ({
  coins,
  bonus,
  steps,
  eggs: Array.from({ length: eggs }, (_, i) => ({ tier: 'common' as const, steps: steps - i * 10 })),
  summary,
})

const memoryStore = (): Store & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k), keys: () => [...data.keys()] }
}

describe('co-op banking', () => {
  it('pays deltas: the victory, then the endless mode’s end, never the same ₽ twice', () => {
    const first = bankDelta(NOTHING_BANKED, payout(300, 100, 1), true)
    expect(first.delta).toMatchObject({ coins: 350, steps: 100, eggs: [{ tier: 'common', steps: 100 }] })
    const later = bankDelta(first.next, payout(500, 160, 2), true)
    expect(later.delta).toMatchObject({ coins: 200, steps: 60, eggs: [{ tier: 'common', steps: 150 }], before: summary })
    expect(bankDelta(later.next, payout(500, 160, 2), true).delta).toMatchObject({ coins: 0, steps: 0, eggs: [] })
  })

  it('a quit forfeits the bonus, and the bonus banked once is never taken back', () => {
    const quit = bankDelta(NOTHING_BANKED, payout(300, 0, 0), false)
    expect(quit.delta.coins).toBe(300)
    const won = bankDelta(bankDelta(NOTHING_BANKED, payout(300, 0, 0), true).next, payout(300, 0, 0), false)
    expect(won.delta.coins).toBe(0)
  })

  it('survives a reload: the record is persisted by room and run before paying', () => {
    const store = memoryStore()
    const key = bankKey('K7QF2', 3)
    let paid = 0
    const pay = (d: { coins: number }) => void (paid += d.coins)
    bank(store, key, payout(400, 10, 0), true, pay)
    // The page reloads and rejoins the run (same room and run): it banks again at the end.
    bank(store, key, payout(400, 10, 0), true, pay)
    bank(store, key, payout(420, 10, 0), true, pay)
    expect(paid).toBe(470)
    expect(loadBanked(store, key).coins).toBe(470)
    // Another run of the same room banks on its own.
    bank(store, bankKey('K7QF2', 4), payout(100, 0, 0), false, pay)
    expect(paid).toBe(570)
  })

  it('keeps a bounded number of records', () => {
    const store = memoryStore()
    for (let run = 1; run <= 40; run++) bank(store, bankKey('ROOMS', run), payout(1, 0, 0), false, () => {})
    expect(store.keys().length).toBeLessThanOrEqual(24)
    expect(loadBanked(store, bankKey('ROOMS', 40)).coins).toBe(1)
  })
})
