import type { PlayerStats } from '../game/coop'

/** Superlatives a player wins outright: the clear best of the team at something, in the order they're handed out. */
const OUTRIGHT = ['damage', 'kills', 'revives', 'untouched', 'tank', 'comeback'] as const
/** For whoever won nothing outright: true of them, but no claim to be the team's best. Enough for a full team. */
const FALLBACK = ['survivor', 'specialist', 'collector', 'loyal'] as const

/** The end screen's superlatives (`team.results.awards`). */
export const AWARDS = [...OUTRIGHT, ...FALLBACK] as const

export type AwardId = (typeof AWARDS)[number]

/** How each outright award scores a player (higher wins) and whether the winner's score earns it at all. */
const SCORE: Record<(typeof OUTRIGHT)[number], { score: (s: PlayerStats) => number; earns: (s: PlayerStats) => boolean }> = {
  damage: { score: (s) => s.damage, earns: (s) => s.damage > 0 },
  kills: { score: (s) => s.kills, earns: (s) => s.kills > 0 },
  revives: { score: (s) => s.revives, earns: (s) => s.revives > 0 },
  untouched: { score: (s) => -s.taken, earns: () => true },
  tank: { score: (s) => s.taken, earns: (s) => s.taken > 0 },
  comeback: { score: (s) => s.faints, earns: (s) => s.faints > 0 },
}

/** A player's best single move's share of their damage (0..1). */
const topShare = (s: PlayerStats) => {
  let top = 0
  for (const d of Object.values(s.damageByMove)) top = Math.max(top, d ?? 0)
  return s.damage > 0 ? top / s.damage : 0
}

/** Whether a fallback is true of a player: no faints, half their damage from one move; anyone collects moves and plays for the team. */
const FITS: Record<(typeof FALLBACK)[number], (s: PlayerStats) => boolean> = {
  survivor: (s) => s.faints === 0,
  specialist: (s) => topShare(s) >= 0.5,
  collector: () => true,
  loyal: () => true,
}

/**
 * One distinct superlative for every player who stayed, by index of
 * `players` (none for those who left, none solo). Each outright award goes to
 * the team's clear best at it (a tie, or a best who already has one, gives
 * it to nobody); then everyone still without one gets, in seat order, the
 * first fallback left that's true of them (else the first left). Never the
 * same award twice. Pure: every client shows the same.
 */
export const teamAwards = (players: readonly PlayerStats[]): (AwardId | null)[] => {
  const out: (AwardId | null)[] = players.map(() => null)
  const stayed = players.filter((s) => !s.gone)
  if (stayed.length < 2) return out
  for (const id of OUTRIGHT) {
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
  const left: (typeof FALLBACK)[number][] = [...FALLBACK]
  for (const s of stayed) {
    const i = players.indexOf(s)
    if (out[i] !== null) continue
    const id = left.find((f) => FITS[f](s)) ?? left[0]
    if (!id) break
    out[i] = id
    left.splice(left.indexOf(id), 1)
  }
  return out
}
