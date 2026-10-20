import { PLAYABLE_IDS, type PlayableId } from '../data/hatchlings'
import { COOP } from '../data/coop'
import { parseDifficulty, type Difficulty } from '../game/difficulty'
import { createCoopGame, type CoopLoadout } from '../game/game'
import { NO_RANKS, UPGRADE_IDS, UPGRADES, type Ranks, type UpgradeId } from '../game/meta'
import { isRecord } from '../game/parse'
import type { Game } from '../game/types'
import type { Loadout, RunStart, Settings } from '../net/protocol'

/**
 * A co-op run's tick 0 from what the relay sends (`RunStart`): the seed, the
 * host's settings and each seat's loadout, all opaque JSON to the relay, read
 * here the same way on every client. Part of the simulation's build id.
 */

/** What a player sends as their loadout: their Pokémon, Poké Mart ranks and whether it plays shiny. */
export type CoopPick = { starter: PlayableId; ranks: Ranks; shiny: boolean }

/** The room's settings as the host sets them. */
export type CoopSettings = { difficulty: Difficulty }

export const loadoutOf = (pick: CoopPick): Loadout => ({ starter: pick.starter, ranks: { ...pick.ranks }, shiny: pick.shiny })

export const settingsOf = (s: CoopSettings): Settings => ({ difficulty: s.difficulty })

const rankOf = (raw: unknown, max: number) => (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? Math.min(raw, max) : 0)

/** A loadout from the wire: an unknown Pokémon falls back to the first starter, ranks are clamped to the Poké Mart's. */
export const parseLoadout = (raw: Loadout): CoopPick => {
  const starter = PLAYABLE_IDS.find((id) => id === raw.starter) ?? PLAYABLE_IDS[0]!
  const r = raw.ranks
  const ranks: Record<UpgradeId, number> = { ...NO_RANKS }
  if (isRecord(r)) for (const id of UPGRADE_IDS) ranks[id] = rankOf(r[id], UPGRADES[id].maxRank)
  return { starter, ranks, shiny: raw.shiny === true }
}

export const parseSettings = (raw: Settings): CoopSettings => ({ difficulty: parseDifficulty(raw.difficulty) })

/** The loadouts of a run, by slot (`RunStart.players` order), with each player's name. */
export const runLoadouts = (start: RunStart): CoopLoadout[] => start.players.map((p) => ({ ...parseLoadout(p.loadout), name: p.name }))

/** The run's game at tick 0: every client builds the same one. */
export const startGame = (start: RunStart): Game =>
  createCoopGame(start.seed, runLoadouts(start), { difficulty: parseSettings(start.settings).difficulty, view: { ...COOP.view } })
