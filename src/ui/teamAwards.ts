import type { PlayerStats } from '../game/coop'

/** The end screen's superlatives (`team.results.awards`), in the order they're handed out. */
export const AWARDS = ['damage', 'revives', 'kills', 'untouched', 'tank', 'comeback'] as const

export type AwardId = (typeof AWARDS)[number]

/** How each award scores a player (higher wins) and whether a score earns it at all. */
const SCORE: Record<AwardId, { score: (s: PlayerStats) => number; earns: (s: PlayerStats) => boolean }> = {
  damage: { score: (s) => s.damage, earns: (s) => s.damage > 0 },
  revives: { score: (s) => s.revives, earns: (s) => s.revives > 0 },
  kills: { score: (s) => s.kills, earns: (s) => s.kills > 0 },
  untouched: { score: (s) => -s.taken, earns: () => true },
  tank: { score: (s) => s.taken, earns: (s) => s.taken > 0 },
  comeback: { score: (s) => s.faints, earns: (s) => s.faints > 0 },
}

/**
 * One superlative per player at most, by index of `players`: each award goes
 * to its clear winner among the players who stayed (a tie gives it to nobody)
 * unless that player already has one. Solo runs get none. Pure.
 */
export const teamAwards = (players: readonly PlayerStats[]): (AwardId | null)[] => {
  const out: (AwardId | null)[] = players.map(() => null)
  const stayed = players.filter((s) => !s.gone)
  if (stayed.length < 2) return out
  for (const id of AWARDS) {
    const { score, earns } = SCORE[id]
    let best: PlayerStats | null = null
    let tie = false
    for (const s of stayed) {
      if (best === null || score(s) > score(best)) {
        best = s
        tie = false
      } else if (score(s) === score(best)) tie = true
    }
    if (!best || tie || !earns(best)) continue
    const i = players.indexOf(best)
    if (out[i] === null) out[i] = id
  }
  return out
}
