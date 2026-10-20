import type { CoopInvite } from '../game/friends'
import type { Member, RoomView } from '../net/protocol'

/**
 * The co-op room's rules as the lobby screens read them (`ui/coopRoom.ts`):
 * what a member's card says, who the host's start waits on (the relay's
 * own check, `relay/src/room.ts`), which invites to show, and whether the
 * beta's entry shows. DOM-free and not part of the simulation's build id.
 */

/** What a member's card says, most pressing first: gone quiet, away in a run, the host, ready, still choosing. */
export type MemberState = 'offline' | 'away' | 'host' | 'ready' | 'picking'

export const memberState = (m: Member): MemberState => (!m.online ? 'offline' : m.away ? 'away' : m.host ? 'host' : m.ready && m.loadout ? 'ready' : 'picking')

/** The members online and how many of them are set (the host counts as set): what "Começar" waits on. Matches the relay's `start`. */
export const readiness = (room: RoomView) => {
  const online = room.members.filter((m) => m.online)
  const ready = online.filter((m) => (m.host || m.ready) && m.loadout !== null).length
  return { ready, total: online.length, all: ready === online.length }
}

/**
 * Whether the lobby shows the co-op entry: a device override (`ps:coopBeta`,
 * `on` or `off`) wins, then dev builds show it, then the PostHog flag
 * (`null` while it hasn't answered: hidden).
 */
export const betaOn = (o: { dev: boolean; override: string | null; flag: boolean | null }) => (o.override === 'on' ? true : o.override === 'off' ? false : o.dev || o.flag === true)

/** Invites worth a banner now: not shown yet, not expired (by `now`, ms), and not into the room the player is already in. */
export const freshInvites = (invites: readonly CoopInvite[], shown: ReadonlySet<string>, room: string | null, now: number) =>
  invites.filter((i) => !shown.has(i.id) && i.room !== room && Date.parse(i.expiresAt) > now)
