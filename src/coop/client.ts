import { moveCode } from '../game/replay'
import type { Vec } from '../engine/math'
import { PROTOCOL, REGIONS, type ClientMessage, type CloseReason, type CreateResponse, type Refusal, type Region, type RoomView, type RunStart, type ServerMessage } from '../net/protocol'
import type { Store } from './bank'
import type { Input } from './entries'
import { ack, createOutbox, due, onReconnect, onSlow, push, queued, type Outbox } from './outbox'
import { advance, backlog, onEnded, onFrame, onSnapPart, onSync, syncProgress, createRunner, type Runner, type RunnerDeps } from './runner'
import { closeReason, parseServerMessage } from './wire'
import { loadoutOf, settingsOf, type CoopPick, type CoopSettings } from './start'

/**
 * The co-op client: one room, its socket and the run's lockstep, as plain
 * state and functions (`createCoopClient` returns them bound to one client).
 * DOM-free: the browser passes its WebSocket, localStorage and Clerk token;
 * the soak bots pass Node's. Nothing here ever blocks solo play.
 *
 * - Identity: a signed-in player sends a fresh Clerk token on every
 *   (re)connect (co-op is for accounts: a production relay refuses guests
 *   with `signIn`); a guest, on the dev and local relays only (bots, the
 *   soak, dev builds), a persistent id. The seat secret the relay gives is
 *   kept by room code, so any tab opened from the link takes the same seat.
 * - Reconnects on its own with backoff and jitter, resuming from the last tick
 *   it knows (`resume.from`), keeping its state. It rides out TCP stalls:
 *   "stalled" after `CONNECT.stalled` ms without a message (the overlay),
 *   a fresh socket after `CONNECT.dead` without one or `CONNECT.uplink` without a pong.
 * - Final closes (`replaced`, `kicked`, `left`, `expired`, a refused build…)
 *   end the client with a typed reason and never reconnect.
 */

export const CONNECT = {
  /** Backoff: the first retry after about `first` ms, doubling to `max`, ±`jitter` of it. */
  first: 250,
  max: 5000,
  jitter: 0.3,
  /** No message for this long in a run: show "reconnecting" (frames stalled). */
  stalled: 1000,
  /** No message for this long: the socket is dead, open another. */
  dead: 8000,
  /**
   * A ping unanswered this long while frames still come: the uplink stalled, open another. Under the relay's
   * 5 s `away`, past the 2.8–4.3 s single-socket stalls measured on home Wi-Fi (those ride out on the same socket).
   */
  uplink: 4500,
  /** The run's end (`over`) is said again this often (ms) until the relay confirms it: one sent on a dying socket is lost. */
  over: 2000,
  /** Pings and heartbeats (ms). The relay calls a seat silent for 5 s `away`. */
  ping: 500,
  heartbeat: 1500,
  /** A stick held unchanged is sent again this often (ms), so prediction stays anchored. */
  stickEvery: 250,
  /** The hello must be answered within this long, or the socket is dropped and retried. */
  hello: 8000,
  /** Far behind (ticks): a resume would replay too much, a fresh join takes the agreed snapshot instead. */
  jump: 1800,
} as const

/** Why a client stopped for good. `build`: the room runs another version of the game (update to play together); `signIn`: the relay takes accounts only. */
export type CloseWhy = CloseReason | Exclude<Refusal, 'unavailable'> | 'unavailable' | 'offline'

export type Status =
  | { kind: 'idle' }
  | { kind: 'connecting'; attempt: number }
  /** In the room, outside a run (the lobby, or after a run). */
  | { kind: 'room' }
  | { kind: 'playing' }
  | { kind: 'closed'; why: CloseWhy }

export type CreateResult = { ok: true; code: string; region: Region } | { ok: false; why: Extract<CreateResponse, { error: string }>['error'] | 'offline' }

export type JoinResult = { ok: true; seat: number; room: RoomView } | { ok: false; why: CloseWhy }

export type Quality = 'good' | 'fair' | 'poor' | 'offline'

/** What the UI reads to draw the connection pip and the overlays. */
export type Connection = {
  quality: Quality
  /** Round trip (ms, smoothed), 0 before the first pong. */
  rtt: number
  /** Ticks held against jitter. */
  hold: number
  /** No message for a while: the reconnecting overlay shows. */
  stalled: boolean
  /** Far behind and catching up: 0..1, or null. */
  syncing: number | null
  reconnects: number
}

export type CoopEvent =
  | { kind: 'status'; status: Status }
  | { kind: 'room'; room: RoomView }
  /** A run began (tick 0 in `startsIn` ms), or this client joined one mid-way: `runner` holds its game. */
  | { kind: 'run'; runner: Runner; why: 'start' | 'join' | 'seed' | 'heal' }
  /** The runner's game object was replaced (a restore): re-link what the shell shares with it. */
  | { kind: 'game'; runner: Runner; why: 'join' | 'heal' | 'seed' }
  /** The relay is bringing this client to the run's present: from its own state (`resume`), the agreed snapshot (`base`) or the seed. */
  | { kind: 'sync'; reason: 'join' | 'resume' | 'heal'; from: number; to: number; base: number | null }
  /** A heal finished: the client is back in step with the team. */
  | { kind: 'healed'; tick: number; ms: number }
  | { kind: 'ended'; run: number; tick: number }
  | { kind: 'denied'; why: 'notHost' | 'notReady' }
  | { kind: 'slow' }

/** What the client hears from its socket. */
export type SocketHandlers = { open: () => void; message: (data: unknown) => void; close: (code: number) => void }

/** A socket, as the client uses it (`webSocket` wraps the browser's and Node's `WebSocket`). */
export type SocketLike = { send: (data: string) => void; close: () => void; isOpen: () => boolean; buffered: () => number }

/** The standard `WebSocket` (browsers, Node 22+) as a `SocketLike`. */
export const webSocket = (url: string, on: SocketHandlers): SocketLike => {
  const ws = new WebSocket(url)
  ws.onopen = () => on.open()
  ws.onmessage = (e) => on.message(e.data)
  ws.onclose = (e) => on.close(e.code)
  ws.onerror = () => {}
  return {
    send: (d) => ws.send(d),
    close: () => {
      try {
        ws.close()
      } catch {
        // Closed already.
      }
    },
    isOpen: () => ws.readyState === WebSocket.OPEN,
    buffered: () => ws.bufferedAmount,
  }
}

export type CoopDeps = {
  /** The relay's base URL (`https://…`). */
  url: string
  /** The simulation's build id (`__SIM_BUILD__`). */
  build: string
  socket: (url: string, on: SocketHandlers) => SocketLike
  fetch: (url: string, init: { method: string; body: string; headers: Record<string, string> }) => Promise<{ json: () => Promise<unknown> }>
  store: Store
  /** A fresh Clerk session token when signed in (asked on every connect), else null (a guest: dev and local relays only). */
  token: () => Promise<string | null>
  name: () => string
  now: () => number
  random: () => number
}

/** Stick samples kept for prediction: far more than any round trip. */
export const HISTORY = 256

/** Special presses kept for prediction: a round trip never holds more than a few. */
const SPECIALS_KEPT = 8

export type ClientState = {
  status: Status
  code: string | null
  seat: number | null
  room: RoomView | null
  runner: Runner | null
  outbox: Outbox
  socket: SocketLike | null
  welcomed: boolean
  /** Opened by `join`, kept until `leave` or a final close. */
  wanted: boolean
  attempt: number
  reconnects: number
  retryAt: number | null
  lastMessageAt: number
  /** The oldest ping not answered yet (ms), or null. */
  pingAt: number | null
  lastPingAt: number
  lastSentAt: number
  rtt: number
  hidden: boolean
  /** The stick: input samples taken (60 a second while the run plays), their codes, and the last one sent. */
  sample: number
  history: Uint8Array
  /** The samples the last special presses went out at (`SPECIALS_KEPT` of them, oldest first), for prediction to press them before the run does. */
  specials: number[]
  stickSent: { code: number; at: number }
  /** Next rejoin should skip the resume (fresh: the agreed snapshot). */
  fresh: boolean
  /** A `role` that came before the run's runner. */
  uploader: boolean
  /** When `over` last went out (ms). */
  overAt: number
  /** The build the room runs, from a `build` refusal (else null): older or newer than this client's. */
  roomBuild: string | null
}

export const createCoopClient = (deps: CoopDeps) => {
  const s: ClientState = {
    status: { kind: 'idle' },
    code: null,
    seat: null,
    room: null,
    runner: null,
    outbox: createOutbox(),
    socket: null,
    welcomed: false,
    wanted: false,
    attempt: 0,
    reconnects: 0,
    retryAt: null,
    lastMessageAt: 0,
    pingAt: null,
    lastPingAt: 0,
    lastSentAt: 0,
    rtt: 0,
    hidden: false,
    sample: 0,
    history: new Uint8Array(HISTORY),
    specials: [],
    stickSent: { code: -1, at: -Infinity },
    fresh: false,
    uploader: false,
    overAt: -Infinity,
    roomBuild: null,
  }
  const listeners = new Set<(e: CoopEvent) => void>()
  const emit = (e: CoopEvent) => listeners.forEach((fn) => fn(e))
  let joining: ((r: JoinResult) => void) | null = null

  const setStatus = (status: Status) => {
    s.status = status
    emit({ kind: 'status', status })
  }

  const httpUrl = deps.url.replace(/\/$/, '')
  const wsUrl = (code: string) => `${httpUrl.replace(/^http/, 'ws')}/rooms/${code}/ws`
  const secretKey = (code: string) => `ps:coopSeat:${code}`
  const GUEST_KEY = 'ps:coopGuest'

  const guestId = () => {
    const kept = deps.store.get(GUEST_KEY)
    if (kept && /^[A-Za-z0-9_-]{16,64}$/.test(kept)) return kept
    const id = Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(deps.random() * 36)]).join('')
    deps.store.set(GUEST_KEY, id)
    return id
  }

  const send = (msg: ClientMessage) => {
    const ws = s.socket
    if (!ws || !s.welcomed || !ws.isOpen()) return false
    try {
      // Snapshot chunks start with `t` (the relay picks its size limit from that prefix): JSON keeps key order.
      ws.send(JSON.stringify(msg))
      s.lastSentAt = deps.now()
      return true
    } catch {
      return false
    }
  }

  const runnerDeps: RunnerDeps = {
    send: (msg) => void send(msg),
    now: deps.now,
    onGame: (runner, why) => emit({ kind: 'game', runner, why }),
    onHealed: (_, tick, ms) => emit({ kind: 'healed', tick, ms }),
    onFailed: () => {
      s.fresh = true
      reconnect()
    },
  }

  /** Ends the client for good: no reconnect, and no run (nothing simulates it any more). */
  const finish = (why: CloseWhy) => {
    s.wanted = false
    s.retryAt = null
    s.runner = null
    const ws = s.socket
    s.socket = null
    s.welcomed = false
    ws?.close()
    if (why === 'left' || why === 'kicked' || why === 'expired') deps.store.remove(secretKey(s.code ?? ''))
    joining?.({ ok: false, why })
    joining = null
    setStatus({ kind: 'closed', why })
  }

  /** The next retry, with backoff and jitter. */
  const scheduleRetry = () => {
    const base = Math.min(CONNECT.max, CONNECT.first * 2 ** Math.min(s.attempt, 8))
    const wait = base * (1 + (deps.random() * 2 - 1) * CONNECT.jitter)
    s.attempt++
    s.retryAt = deps.now() + wait
    setStatus({ kind: 'connecting', attempt: s.attempt })
  }

  /** Drops the socket (no final reason) and reconnects. */
  const reconnect = () => {
    const ws = s.socket
    s.socket = null
    s.welcomed = false
    s.pingAt = null
    ws?.close()
    if (s.wanted) scheduleRetry()
  }

  const resumeFrom = () => {
    const r = s.runner
    if (s.fresh || !r || r.pending) return null
    return { run: r.start.id, from: r.known }
  }

  const open = async () => {
    const code = s.code
    if (!code || !s.wanted || s.socket) return
    s.retryAt = null
    const token = await deps.token().catch(() => null)
    if (!s.wanted || s.socket) return
    // Every handler checks it still speaks for the current socket: an old one's late events are ignored.
    let ws: SocketLike | null = null
    const handlers: SocketHandlers = {
      open: () => {
        if (!ws || s.socket !== ws) return
        const hello: ClientMessage = {
          t: 'hello',
          v: PROTOCOL,
          build: deps.build,
          room: code,
          auth: token ? { kind: 'clerk', token } : { kind: 'guest', id: guestId() },
          secret: deps.store.get(secretKey(code)),
          name: deps.name(),
          resume: resumeFrom(),
        }
        ws.send(JSON.stringify(hello))
      },
      message: (data) => {
        if (!ws || s.socket !== ws) return
        s.lastMessageAt = deps.now()
        const m = parseServerMessage(data)
        if (m) receive(m)
      },
      close: (closeCode) => {
        if (!ws || s.socket !== ws) return
        s.socket = null
        s.welcomed = false
        s.pingAt = null
        const why = closeReason(closeCode)
        // Refused before a welcome: the `refused` message already said why.
        if (why === 'refused') return finish(lastRefusal ?? 'unavailable')
        if (why) return finish(why)
        s.reconnects++
        if (s.wanted) scheduleRetry()
      },
    }
    try {
      ws = deps.socket(wsUrl(code), handlers)
    } catch {
      return scheduleRetry()
    }
    s.socket = ws
    s.welcomed = false
    s.lastMessageAt = deps.now()
  }

  let lastRefusal: CloseWhy | null = null

  const runnerFor = (start: RunStart) => {
    const r = createRunner(start, s.code ?? '', s.seat ?? 0)
    r.uploader = s.uploader
    return r
  }

  /** The room says the run is over (it ended while this client's socket was down, so it missed `ended`). */
  const endedWhileAway = (room: RoomView) => {
    const r = s.runner
    if (!r || r.ended || room.phase === 'playing' || room.run !== r.start.id) return
    onEnded(r, r.over?.tick ?? r.next)
    emit({ kind: 'ended', run: r.start.id, tick: r.endedAt ?? r.next })
  }

  const receive = (m: ServerMessage) => {
    const now = deps.now()
    switch (m.t) {
      case 'welcome': {
        s.welcomed = true
        s.seat = m.seat
        s.room = m.room
        s.attempt = 0
        s.fresh = false
        if (s.code) deps.store.set(secretKey(s.code), m.secret)
        onReconnect(s.outbox)
        s.stickSent = { code: -1, at: -Infinity }
        joining?.({ ok: true, seat: m.seat, room: m.room })
        joining = null
        setStatus({ kind: m.room.phase === 'playing' ? 'playing' : 'room' })
        emit({ kind: 'room', room: m.room })
        endedWhileAway(m.room)
        return
      }
      case 'refused':
        lastRefusal = m.code
        if (m.code === 'build' && typeof m.build === 'string') s.roomBuild = m.build
        return
      case 'room': {
        s.room = m.room
        endedWhileAway(m.room)
        const playing = m.room.phase === 'playing'
        if (s.status.kind === 'room' && playing) setStatus({ kind: 'playing' })
        if (s.status.kind === 'playing' && !playing) setStatus({ kind: 'room' })
        return emit({ kind: 'room', room: m.room })
      }
      case 'start': {
        s.uploader = false
        const r = runnerFor(m.run)
        s.runner = r
        setStatus({ kind: 'playing' })
        return emit({ kind: 'run', runner: r, why: 'start' })
      }
      case 'sync': {
        emit({ kind: 'sync', reason: m.reason, from: m.from, to: m.to, base: m.base?.tick ?? null })
        const before = s.runner
        // The relay may order the same heal again for hashes sent before the first reached us: one restore is enough.
        if (m.reason === 'heal' && before && before.healing && m.base && before.stats.syncs.at(-1)?.base === m.base.tick && before.start.id === m.run.id) return
        const next = onSync(before, m, s.code ?? '', s.seat ?? 0, runnerDeps)
        if (next === 'rejoin') {
          s.fresh = true
          return reconnect()
        }
        next.uploader = before === next ? next.uploader : s.uploader
        s.runner = next
        if (next !== before) emit({ kind: 'run', runner: next, why: m.reason === 'heal' ? 'heal' : m.base ? 'join' : 'seed' })
        if (s.status.kind !== 'playing') setStatus({ kind: 'playing' })
        return
      }
      case 'snapPart':
        if (s.runner) onSnapPart(s.runner, m, runnerDeps)
        return
      case 'frame': {
        const r = s.runner
        if (!r) return
        const seat = s.seat ?? -1
        if (!onFrame(r, m, now, (e) => ack(s.outbox, seat, e))) {
          // A gap (never expected on one ordered socket): resync from what we have.
          return reconnect()
        }
        return
      }
      case 'heal':
        return
      case 'role':
        s.uploader = m.snapshots
        if (s.runner) s.runner.uploader = m.snapshots
        return
      case 'ended': {
        const r = s.runner
        if (r && r.start.id === m.run) onEnded(r, m.tick)
        return emit({ kind: 'ended', run: m.run, tick: m.tick })
      }
      case 'denied':
        return emit({ kind: 'denied', why: m.why })
      case 'slow':
        onSlow(s.outbox, now)
        return emit({ kind: 'slow' })
      case 'pong':
        if (s.pingAt !== null && m.at <= now) {
          const rtt = now - m.at
          s.rtt = s.rtt === 0 ? rtt : s.rtt * 0.8 + rtt * 0.2
        }
        s.pingAt = null
        return
      case 'bye':
        return
    }
  }

  /** Joins room `code` (a link, a typed code): resolves once the relay seats this client or refuses it. */
  const join = (code: string): Promise<JoinResult> => {
    if (s.socket) leaveQuietly()
    s.code = code
    s.wanted = true
    s.attempt = 0
    s.runner = null
    s.room = null
    s.fresh = false
    s.roomBuild = null
    lastRefusal = null
    setStatus({ kind: 'connecting', attempt: 0 })
    return new Promise((resolve) => {
      joining = resolve
      void open()
    })
  }

  /** Reserves a room near this player (or in `region`) and joins it. */
  const create = async (region: Region = 'auto'): Promise<CreateResult> => {
    try {
      const res = await deps.fetch(`${httpUrl}/rooms`, { method: 'POST', body: JSON.stringify({ v: PROTOCOL, build: deps.build, region }), headers: { 'Content-Type': 'application/json' } })
      const body: unknown = await res.json()
      if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') {
        const region = REGIONS.find((r) => 'region' in body && r === body.region) ?? 'auto'
        return { ok: true, code: body.code, region }
      }
      const error = typeof body === 'object' && body !== null && 'error' in body ? body.error : null
      return { ok: false, why: error === 'version' || error === 'rate' || error === 'busy' || error === 'invalid' ? error : 'offline' }
    } catch {
      return { ok: false, why: 'offline' }
    }
  }

  const leaveQuietly = () => {
    s.wanted = false
    const ws = s.socket
    s.socket = null
    ws?.close()
  }

  /** Leaves the room for good (in a run: the Pokémon leaves the field; the share was banked by the shell). */
  const leave = () => {
    if (s.welcomed) send({ t: 'leave' })
    if (s.code) deps.store.remove(secretKey(s.code))
    finish('left')
  }

  /** Queues an input of the player's for the run. */
  const input = (i: Input) => {
    if (s.status.kind !== 'playing' || s.hidden) return 0
    if (i.k === 'special') {
      s.specials.push(i.sample)
      if (s.specials.length > SPECIALS_KEPT) s.specials.shift()
    }
    return push(s.outbox, i, deps.now())
  }

  /**
   * Takes one 60 Hz sample of the stick (the shell calls it once per tick of
   * real time while the run plays): kept for prediction, sent when it changes
   * (and again every `CONNECT.stickEvery` ms while held, to anchor prediction).
   */
  const stick = (move: Vec) => {
    const code = moveCode(move)
    s.sample++
    s.history[s.sample % HISTORY] = code
    const now = deps.now()
    if (code === s.stickSent.code && (code === 0 || now - s.stickSent.at < CONNECT.stickEvery)) return
    s.stickSent = { code, at: now }
    input({ k: 'move', code, sample: s.sample })
  }

  /** The tab went to the background (true) or came back. Hidden, the run isn't simulated and nothing is sent (the relay calls the seat away). */
  const setHidden = (hidden: boolean) => {
    if (s.hidden === hidden) return
    s.hidden = hidden
    if (hidden) return
    s.lastMessageAt = Math.max(s.lastMessageAt, deps.now() - CONNECT.stalled)
    s.pingAt = null
    const r = s.runner
    // Gone long: the agreed snapshot is quicker than simulating it all.
    if (r && !r.ended && backlog(r) > CONNECT.jump) {
      s.fresh = true
      return reconnect()
    }
    if (s.wanted && !s.socket) {
      s.attempt = 0
      void open()
    }
  }

  /**
   * One display frame (`dt` seconds): retries a dropped socket when due,
   * watches for stalls, pings, flushes the inputs and simulates the run.
   * Returns how many ticks ran.
   */
  const frame = (dt: number): number => {
    const now = deps.now()
    if (s.wanted && !s.socket && s.retryAt !== null && now >= s.retryAt && !s.hidden) void open()
    const ws = s.socket
    if (ws && !s.hidden) {
      const silent = now - s.lastMessageAt
      if (!s.welcomed && silent > CONNECT.hello) return (s.reconnects++, reconnect(), 0)
      if (s.welcomed && silent > CONNECT.dead) return (s.reconnects++, reconnect(), 0)
      // Not while syncing: a client busy catching up answers its own pongs late.
      if (s.welcomed && s.pingAt !== null && now - s.pingAt > CONNECT.uplink && !s.runner?.syncing) return (s.reconnects++, reconnect(), 0)
      if (s.welcomed) {
        if (now - s.lastPingAt >= CONNECT.ping) {
          s.lastPingAt = now
          s.pingAt ??= now
          send({ t: 'ping', at: now })
        }
        // Only what the socket can take: a stalled one keeps the stick coalesced instead of piling up.
        if (ws.buffered() < 64 * 1024) for (const msg of due(s.outbox, now, s.rtt)) send(msg)
        if (now - s.lastSentAt >= CONNECT.heartbeat) send({ t: 'hb' })
        const r = s.runner
        if (r?.over && !r.ended && now - s.overAt >= CONNECT.over) {
          s.overAt = now
          send({ t: 'over', ...r.over })
        }
      }
    }
    const r = s.runner
    if (!r || s.hidden) return 0
    return advance(r, dt, runnerDeps)
  }

  /** How the connection is doing, for the pip and the overlays. */
  const connection = (): Connection => {
    const now = deps.now()
    const r = s.runner
    const stalled = s.status.kind === 'playing' && !s.hidden && (!s.welcomed || now - s.lastMessageAt > CONNECT.stalled)
    const hold = r?.hold.hold ?? 0
    const quality: Quality = stalled || !s.welcomed ? 'offline' : s.rtt > 250 || hold >= 8 ? 'poor' : s.rtt > 140 || hold >= 5 ? 'fair' : 'good'
    return { quality, rtt: Math.round(s.rtt), hold, stalled, syncing: r ? syncProgress(r) : null, reconnects: s.reconnects }
  }

  return {
    state: (): Readonly<ClientState> => s,
    on: (fn: (e: CoopEvent) => void) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    create,
    join,
    leave,
    setLoadout: (pick: CoopPick) => send({ t: 'loadout', loadout: loadoutOf(pick) }),
    setReady: (ready: boolean) => send({ t: 'ready', ready }),
    setSettings: (settings: CoopSettings) => send({ t: 'settings', settings: settingsOf(settings) }),
    kick: (seat: number) => send({ t: 'kick', seat }),
    /** The host starts the run (or the next one, after a run: "Jogar de novo"); everyone else must be ready. */
    start: () => send({ t: 'start' }),
    input,
    stick,
    setHidden,
    frame,
    connection,
    /** Inputs waiting to go out (bounded). */
    queued: () => queued(s.outbox),
    /** Test and soak hooks: drop the socket as a network failure would, or rejoin afresh (a new tab: the snapshot). */
    drop: () => (s.reconnects++, reconnect()),
    rejoinFresh: () => {
      s.runner = null
      s.fresh = true
      s.reconnects++
      reconnect()
    },
  }
}

export type CoopClient = ReturnType<typeof createCoopClient>
