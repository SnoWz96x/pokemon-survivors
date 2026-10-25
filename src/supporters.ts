import { apiCall } from './api'
import type { PollOptionId } from './data/supporters'
import { isRecord } from './game/parse'
import { parseHidden, parsePoll, parseSupporterStatus, parseWall, type Poll, type SupporterStatus, type SupporterTier, type Wall } from './game/supporters'

/**
 * The supporters' side of the API (`server/`): the player's own standing,
 * redeeming a donation's code, linking a Patreon, the wall and the poll. Like `ranking.ts`,
 * every call fails soft (null), so the screens just say they're out of reach.
 */

/** The signed-in player's standing, or null (guest, offline). */
export const fetchSupporterStatus = async (): Promise<SupporterStatus | null> => {
  const { status, body } = await apiCall('/me/supporter', { auth: true })
  return status === 200 ? parseSupporterStatus(body) : null
}

/** Shows or hides the player's badge and name. Their standing after it, or null when it didn't go through. */
export const setSupporterPublic = async (show: boolean): Promise<SupporterStatus | null> => {
  const { status, body } = await apiCall('/me/supporter', { method: 'PUT', body: { public: show }, auth: true })
  return status === 200 ? parseSupporterStatus(body) : null
}

/** What redeeming a code came to: the tier the account has now, or why not. */
export type Redeemed = { ok: true; tier: SupporterTier | null } | { ok: false; reason: 'unknown' | 'used' | 'offline' }

/** Redeems a donation's code (already normalized by `parseCode`) for the signed-in player. */
export const redeemCode = async (code: string): Promise<Redeemed> => {
  const { status, body } = await apiCall('/donations/redeem', { method: 'POST', body: { code }, auth: true })
  if (status === 200) return { ok: true, tier: parseSupporterStatus(body)?.tier ?? null }
  if (status === 404) return { ok: false, reason: 'unknown' }
  if (status === 409) return { ok: false, reason: 'used' }
  return { ok: false, reason: 'offline' }
}

/**
 * "Link Patreon": leaves for Patreon's approval page, which comes back to
 * this page with `?patreon=linked` (or `failed`). False when the API
 * wouldn't give the way there.
 */
export const linkPatreon = async (): Promise<boolean> => {
  const { status, body } = await apiCall(`/patreon/link?page=${encodeURIComponent(location.pathname)}`, { auth: true })
  if (status !== 200 || !isRecord(body) || typeof body.url !== 'string') return false
  location.assign(body.url)
  return true
}

/** Forgets the player's Patreon. Whether it went through. */
export const unlinkPatreon = async () => (await apiCall('/patreon/link', { method: 'DELETE', auth: true })).status === 200

/** `?patreon=` on the way back from Patreon: how the link went, or null when the page didn't come from there. */
export const patreonReturn = (): 'linked' | 'failed' | null => {
  const v = new URLSearchParams(location.search).get('patreon')
  return v === 'linked' || v === 'failed' ? v : null
}

let wall: Promise<Wall | null> | null = null

/** The wall and the hidden supporters' counts, asked once per page (a failure asks again next time). Null when the API can't be reached. */
export const fetchWall = () =>
  (wall ??= apiCall('/supporters').then(({ status, body }) => {
    if (status !== 200 || !isRecord(body)) {
      wall = null
      return null
    }
    return { entries: parseWall(body.supporters), hidden: parseHidden(body.hidden) }
  }))

/** The current poll, or null when the API can't be reached. */
export const fetchPoll = async (): Promise<Poll | null> => {
  const { status, body } = await apiCall('/poll')
  return status === 200 ? parsePoll(body) : null
}

/** A supporter's vote. The poll after it, `denied` for anyone who isn't a supporter, null offline. */
export const vote = async (choice: PollOptionId): Promise<Poll | 'denied' | null> => {
  const { status, body } = await apiCall('/poll', { method: 'PUT', body: { choice }, auth: true })
  if (status === 403) return 'denied'
  return status === 200 ? parsePoll(body) : null
}
