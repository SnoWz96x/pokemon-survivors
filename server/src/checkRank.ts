import { BOARD_SIZE } from '../../src/game/ranking'

/** The places that are on show: the top of a mode and difficulty's board, and the top 3 of a Pokémon's. */
const SHOWN = { global: BOARD_SIZE, starter: 3 } as const

/** Room past the places on show, so a run a failed check lets climb in still has its replay. */
const MARGIN = 1.2

/**
 * Which ranked runs keep their replay for the re-simulation (`checks.ts`).
 * Runs are trusted: one counts as soon as it's reported, and only a failed
 * check takes it off. So only the runs on show are checked: a challenge's
 * official attempt, or a line within `top` of a board the run is on (its mode
 * and difficulty's, `top.global`, or its Pokémon's, `top.starter`, for the
 * day, the week or all time). `top` is the places on show with a margin
 * (`MARGIN`): a run below them now can't climb later in the same period
 * (boards only get better), except when runs above it fail their checks.
 * On top of those, one run every `sampleEvery` seconds (~20 a day, whatever
 * the traffic) is kept to keep an eye on the simulation's determinism.
 */
export const CHECKED = {
  top: { global: Math.ceil(SHOWN.global * MARGIN), starter: Math.ceil(SHOWN.starter * MARGIN) },
  sampleEvery: 72 * 60,
  /** The check rank of a sample: checked after every run on show. */
  sampleRank: 1000,
} as const

/** The player's line on one board a run is on: its place (null off the board) and whether it's this run (not a better one of theirs). */
export type BoardLine = { board: 'global' | 'starter'; rank: number | null; mine: boolean }

/** Where a finished run stands: a challenge's official attempt or not, and the player's line on each board it's on. */
export type Standing = { official: boolean; lines: readonly BoardLine[] }

/** The run's best place on show (0 for an official attempt), or null when it's on show nowhere. */
export const rankOnShow = ({ official, lines }: Standing): number | null => {
  if (official) return 0
  const places = lines.flatMap(({ board, rank, mine }) => (mine && rank !== null && rank <= CHECKED.top[board] ? [rank] : []))
  return places.length > 0 ? Math.min(...places) : null
}

/**
 * What a run that just reported keeps for its check (`runs.check_rank`, the
 * order the checks take: lowest first): its place on show, else the sample's
 * rank when one is due, else null, and its replay is dropped right away.
 */
export const checkRank = (standing: Standing, sampleDue: boolean): number | null => rankOnShow(standing) ?? (sampleDue ? CHECKED.sampleRank : null)
