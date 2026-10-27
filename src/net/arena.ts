/**
 * The Arena's public queue and match reports on the wire, shared by the game,
 * the relay's matchmaker (`relay/`) and the API (`server/`). Like
 * `protocol.ts`, this file imports nothing: the relay bundles it alone.
 *
 * The flow: a signed-in client opens a WebSocket to the matchmaker
 * (`/arena/queue` on the relay) and sends `queue`; the matchmaker (one
 * Durable Object per region) groups tickets by MMR (the API's, fetched with
 * the ticket's token) and wait, splits teams (`splitTeams` in
 * `game/arenaRank.ts`, mirrored here by data only), makes a locked Arena room
 * on the relay with every seat's team set, and sends each ticket `matched`.
 * Bots fill what's missing after `botsAfter`. When the match ends, the room
 * counts its clients' `ArenaResult`s (opaque to it) and posts the agreed one
 * to the API as an `ArenaReport`, signed with a secret both share.
 */

/** Bumped with any incompatible change to these messages. */
export const ARENA_PROTOCOL = 1

/** What a client in the queue sends. `party`: the code of the friends' party it queues with (all of it joins the same team). */
export type QueueClientMessage =
  | { t: 'queue'; kind: 'casual' | 'ranked'; starter: string; party: string | null; build: string }
  | { t: 'cancel' }
  /** The client's round trip to each relay home, so the match lands where it plays best. */
  | { t: 'rtt'; homes: Record<string, number> }

/** What the matchmaker sends a queued client. */
export type QueueServerMessage =
  /** In the queue: how long it has waited, how many humans the forming match has, and the seconds until bots fill it. */
  | { t: 'queued'; kind: 'casual' | 'ranked'; waited: number; found: number; botsIn: number }
  /** A match: the room to join, the seat's team and whether it's rated. Join within `joinTimeout`. */
  | { t: 'matched'; room: string; team: 0 | 1; ranked: boolean; humans: number }
  /** Refused: not signed in, already queued in another tab, an old build, or the queue is closed. */
  | { t: 'refused'; why: 'auth' | 'duplicate' | 'build' | 'closed' }

/** The room settings a matchmade Arena room carries (opaque to the relay's room, read by `coop/start.ts`). */
export type MatchedSettings = { difficulty: 'normal'; mode: 'versus'; queue: 'casual' | 'ranked'; locked: true }

/**
 * `POST /arena/report` (relay → API), with header `x-arena-signature`: hex
 * HMAC-SHA256 of the raw body with `ARENA_REPORT_SECRET`. `result` is the
 * clients' agreed `ArenaResult` as they sent it (the API parses it with
 * `parseArenaResult`); `seats` maps each slot to its account (null for a bot
 * seat; a human who left keeps theirs and `left: true`).
 */
export type ArenaReport = {
  v: 1
  room: string
  run: number
  kind: 'casual' | 'ranked' | 'room'
  region: string
  endedAt: number
  seats: { slot: number; userId: string | null; handle: string | null; left: boolean }[]
  result: unknown
}
