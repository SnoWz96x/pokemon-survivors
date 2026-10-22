import { DIALGA_DOMAIN } from '../data/domains/dialga'
import type { DomainHooks } from './domainHooks'
import type { DomainState } from './domain'
import { nearestPlayer } from './players'
import type { Game } from './types'
import * as dm from '../engine/dmath'
import { shakeScreen } from './effects'

/**
 * Dialga's hooks: Spear Pillar's time skips. Every `every` s of the crossing
 * time skips, in turn: it stops (the retinue freezes), skips forward (the
 * unravelling front surges and the retinue rushes) or rewinds (the front
 * falls back and the retinue is thrown back the way it came). Each one warns
 * `warn` s first (clock rings over the screen, `render/domainLooks.ts`).
 */
export const TIME_SKIP = {
  first: 7,
  every: 6.5,
  warn: 1.1,
  /** Seconds each skip lasts. */
  length: { stop: 2.6, forward: 2.2, rewind: 1.3 },
  /** Forward: the front rises this many times its pace on top, the retinue walks twice as fast. */
  surge: 1.6,
  /** Rewind: px the front falls back over the skip, and px/s the retinue is thrown back. */
  back: 80,
  throwBack: 120,
} as const

export type TimeSkip = keyof typeof TIME_SKIP.length

const ORDER: readonly TimeSkip[] = ['stop', 'forward', 'rewind']

/** Slots in `DomainState.memo`: next skip due (crossing age), skips so far, warning left, the skip warned of, seconds left on the one playing, which one. */
const NEXT = 0
const COUNT = 1
const WARN = 2
const COMING = 3
const LEFT = 4
const NOW = 5

/** The time skip playing in Dialga's crossing (and its share played 0..1), or the one being warned of; for the look. */
export const timeSkipOf = (d: DomainState): { skip: TimeSkip; k: number; warning: boolean } | null => {
  if (d.legend !== 'dialga' || d.act !== 'crossing' || d.memo.length < 6) return null
  if ((d.memo[LEFT] ?? 0) > 0) {
    const skip = ORDER[d.memo[NOW]!]!
    return { skip, k: 1 - d.memo[LEFT]! / TIME_SKIP.length[skip], warning: false }
  }
  if ((d.memo[WARN] ?? 0) > 0) return { skip: ORDER[d.memo[COMING]!]!, k: 1 - d.memo[WARN]! / TIME_SKIP.warn, warning: true }
  return null
}

const startSkip = (g: Game, d: DomainState, i: number) => {
  const skip = ORDER[i]!
  d.memo[NOW] = i
  d.memo[LEFT] = TIME_SKIP.length[skip]
  if (skip === 'stop') for (const e of g.enemies) if (e.dying < 0 && !e.boss) e.status.stun = Math.max(e.status.stun, TIME_SKIP.length.stop)
  shakeScreen(g, 4, 'team')
  g.events.push({ kind: 'domainCue', enemy: 'dialga', cue: skip }, { kind: 'quake' })
}

/** What a skip does each tick it plays. */
const playSkip = (g: Game, d: DomainState, skip: TimeSkip, dt: number) => {
  const threat = DIALGA_DOMAIN.crossing.threat
  if (skip === 'stop') return
  if (skip === 'forward') d.front = Math.max(threat.stop, d.front - threat.speed * TIME_SKIP.surge * dt)
  else d.front = Math.min(threat.start, d.front + (TIME_SKIP.back / TIME_SKIP.length.rewind) * dt)
  for (const e of g.enemies) {
    if (e.dying >= 0 || e.boss || e.status.stun > 0) continue
    const p = nearestPlayer(g, e.x, e.y)
    const dx = p.x - e.x
    const dy = p.y - e.y
    const len = dm.hypot(dx, dy) || 1
    const step = (skip === 'forward' ? e.speed : -TIME_SKIP.throwBack) * dt
    e.x += (dx / len) * step
    e.y += (dy / len) * step
  }
}

export const DIALGA_HOOKS: DomainHooks = {
  crossing: (g, d, dt) => {
    if (d.memo.length < 6) d.memo.push(TIME_SKIP.first, 0, 0, 0, 0, 0)
    const m = d.memo
    if (d.age >= m[NEXT]!) {
      m[NEXT] = d.age + TIME_SKIP.every
      m[COMING] = m[COUNT]! % ORDER.length
      m[COUNT]!++
      m[WARN] = TIME_SKIP.warn
    }
    if (m[WARN]! > 0) {
      m[WARN]! -= dt
      if (m[WARN]! <= 0) startSkip(g, d, m[COMING]!)
    }
    if (m[LEFT]! > 0) {
      m[LEFT]! -= dt
      playSkip(g, d, ORDER[m[NOW]!]!, dt)
    }
  },
}
