import type { CoopPayout } from '../game/coop'
import type { EggTier } from '../game/eggs'
import type { RunSummary } from '../game/tally'

/**
 * Banking a co-op run exactly once per player, like solo's `paid`: the run
 * pays deltas of its payout (`coopPayout`) at the victory, at the end and
 * when the player leaves, and what it paid is persisted by room and run before
 * the wallet is touched. A reload, a rejoin, a heal or a second call pays
 * nothing twice (at worst a crash between the two writes pays a little less,
 * never more). Pure but for the `Store` passed in.
 */

/** What a run already paid this device's player. */
export type Banked = {
  /** ₽ deposited: the share, plus the end bonus once it was earned. */
  coins: number
  /** Steps walked into the incubator. */
  steps: number
  /** Team eggs deposited (the first `eggs` of the payout's list). */
  eggs: number
  /** The summary missions and medals last recorded (they count only what changed since). */
  summary: RunSummary | null
}

export type BankDelta = {
  coins: number
  steps: number
  /** Eggs found since the last banking, each with the steps walked since it was found. */
  eggs: { tier: EggTier; steps: number }[]
  /** The run's summary now, and the one recorded before (missions count the difference). */
  summary: RunSummary
  before: RunSummary | null
}

export const NOTHING_BANKED: Banked = { coins: 0, steps: 0, eggs: 0, summary: null }

/** What to bank now on top of `paid`, and what will have been paid after. `withBonus` adds the end bonus (a victory or a finished run). */
export const bankDelta = (paid: Banked, payout: CoopPayout, withBonus: boolean): { delta: BankDelta; next: Banked } => {
  const total = payout.coins + (withBonus ? payout.bonus : 0)
  const coins = Math.max(0, total - paid.coins)
  const steps = Math.max(0, payout.steps - paid.steps)
  const eggs = payout.eggs.slice(paid.eggs)
  return {
    delta: { coins, steps, eggs, summary: payout.summary, before: paid.summary },
    next: { coins: Math.max(paid.coins, total), steps: Math.max(paid.steps, payout.steps), eggs: Math.max(paid.eggs, payout.eggs.length), summary: payout.summary },
  }
}

/** Whether a delta pays anything (missions aside, which `before` keeps idempotent). */
export const paysAnything = (d: BankDelta) => d.coins > 0 || d.steps > 0 || d.eggs.length > 0

/** Where the banked records live (localStorage in the browser, a Map in tests and bots). */
export type Store = { get: (key: string) => string | null; set: (key: string, value: string) => void; remove: (key: string) => void; keys: () => string[] }

const PREFIX = 'ps:coopBank:'

/** Records kept: older runs' records go (a run that old will never bank again). */
const KEEP = 24

export const bankKey = (room: string, run: number) => `${PREFIX}${room}:${run}`

const isBanked = (v: unknown): v is Banked =>
  typeof v === 'object' && v !== null && 'coins' in v && 'steps' in v && 'eggs' in v && typeof v.coins === 'number' && typeof v.steps === 'number' && typeof v.eggs === 'number'

export const loadBanked = (store: Store, key: string): Banked => {
  try {
    const raw: unknown = JSON.parse(store.get(key) ?? 'null')
    return isBanked(raw) ? raw : NOTHING_BANKED
  } catch {
    return NOTHING_BANKED
  }
}

/** Saves what a run paid (before paying it) and prunes the oldest records. */
export const saveBanked = (store: Store, key: string, banked: Banked) => {
  store.set(key, JSON.stringify({ ...banked, at: Date.now() }))
  const mine = store.keys().filter((k) => k.startsWith(PREFIX))
  if (mine.length <= KEEP) return
  const at = (k: string) => {
    try {
      const v: unknown = JSON.parse(store.get(k) ?? 'null')
      return typeof v === 'object' && v !== null && 'at' in v && typeof v.at === 'number' ? v.at : 0
    } catch {
      return 0
    }
  }
  for (const k of mine.sort((a, b) => at(a) - at(b)).slice(0, mine.length - KEEP)) store.remove(k)
}

/**
 * Banks a run's payout now: persists what will have been paid, then hands the
 * delta to `pay` (the wallet, the incubator, missions). Returns the delta.
 */
export const bank = (store: Store, key: string, payout: CoopPayout, withBonus: boolean, pay: (d: BankDelta) => void): BankDelta => {
  const { delta, next } = bankDelta(loadBanked(store, key), payout, withBonus)
  saveBanked(store, key, next)
  pay(delta)
  return delta
}
