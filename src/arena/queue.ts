import type { SocketHandlers, SocketLike } from '../coop/client'
import { isRecord } from '../game/parse'
import type { QueueKind } from '../data/arenaRanked'
import type { QueueClientMessage, QueueServerMessage } from '../net/arena'

/**
 * The Arena's public queue from the client's side: one WebSocket to the
 * matchmaker (`/arena/queue` on the co-op relay's origin, `net/arena.ts`)
 * per ticket. It sends `queue` once open, the round trips to the relay homes
 * when they're measured (`rtt`) and `cancel` when the player backs out, and
 * passes on what the matchmaker says (`queued`, `matched`, `refused`), plus
 * `lost` when the socket drops before a match. DOM-free: the shell passes
 * the socket and the Clerk token.
 */

/** What the queue tells the screen: the matchmaker's messages, or the socket gone before a match. */
export type QueueEvent = QueueServerMessage | { t: 'lost' }

export type QueueDeps = {
  /** The co-op relay's base URL (`https://…`). */
  relay: string
  /** The simulation's build id (`__SIM_BUILD__`): the matchmaker refuses an old one. */
  build: string
  /** A fresh Clerk session token, or null (the matchmaker refuses guests). */
  token: () => Promise<string | null>
  socket: (url: string, on: SocketHandlers) => SocketLike
  /** Round trips (ms) to each relay home this build has; sent when it resolves. */
  rtts?: () => Promise<Record<string, number>>
}

export type Ticket = { kind: QueueKind; starter: string; party: string | null }

/**
 * The matchmaker's WebSocket URL from the relay's: same origin, `ws(s)`,
 * path `/arena/queue`, the Clerk token as `?token=` (a browser can't set
 * headers on a WebSocket).
 */
export const queueUrl = (relay: string, token: string | null) => {
  const base = relay.replace(/^http/, 'ws').replace(/\/+$/, '')
  return `${base}/arena/queue${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

const REFUSALS = ['auth', 'duplicate', 'build', 'closed'] as const
const QUEUES = ['casual', 'ranked'] as const
const whole = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : null)

/** A matchmaker message from the wire (a JSON string); null when it isn't one. */
export const parseQueueMessage = (data: unknown): QueueServerMessage | null => {
  let m: unknown
  try {
    m = typeof data === 'string' ? JSON.parse(data) : null
  } catch {
    return null
  }
  if (!isRecord(m)) return null
  if (m.t === 'queued') {
    const waited = whole(m.waited)
    const found = whole(m.found)
    const botsIn = whole(m.botsIn)
    const kind = QUEUES.find((k) => k === m.kind)
    return kind && waited !== null && found !== null && botsIn !== null ? { t: 'queued', kind, waited, found, botsIn } : null
  }
  if (m.t === 'matched') {
    const humans = whole(m.humans)
    return typeof m.room === 'string' && (m.team === 0 || m.team === 1) && typeof m.ranked === 'boolean' && humans !== null ? { t: 'matched', room: m.room, team: m.team, ranked: m.ranked, humans } : null
  }
  if (m.t === 'refused') {
    const why = REFUSALS.find((w) => w === m.why)
    return why ? { t: 'refused', why } : null
  }
  return null
}

/** Joins the queue with `ticket`; `on` hears every event. `cancel` leaves it (nothing more is heard after). */
export const joinQueue = (deps: QueueDeps, ticket: Ticket, on: (e: QueueEvent) => void) => {
  let ws: SocketLike | null = null
  let over = false
  const send = (m: QueueClientMessage) => ws?.isOpen() && ws.send(JSON.stringify(m))
  const end = () => {
    over = true
    ws?.close()
    ws = null
  }
  void (async () => {
    const token = await deps.token().catch(() => null)
    if (over) return
    ws = deps.socket(queueUrl(deps.relay, token), {
      open: () => {
        send({ t: 'queue', kind: ticket.kind, starter: ticket.starter, party: ticket.party, build: deps.build })
        void deps.rtts?.().then((homes) => !over && Object.keys(homes).length > 0 && send({ t: 'rtt', homes }))
      },
      message: (data) => {
        if (over) return
        const m = parseQueueMessage(data)
        if (!m) return
        // A match or a refusal ends the ticket: the socket's job is done.
        if (m.t !== 'queued') end()
        on(m)
      },
      close: () => {
        if (over) return
        end()
        on({ t: 'lost' })
      },
    })
  })()
  return {
    cancel: () => {
      if (over) return
      send({ t: 'cancel' })
      end()
    },
  }
}

export type QueueHandle = ReturnType<typeof joinQueue>
