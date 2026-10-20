import { DurableObject } from 'cloudflare:workers'
import { CLOSE_CODES, LIMITS, parseClientMessage, type Auth, type Phase, type ServerMessage } from '../../src/net/protocol'
import { jwksKeys, verifyClerkToken } from './auth'
import type { Env } from './env'
import { gzip } from './gzip'
import { allowedOrigin } from './origins'
import {
  connect,
  createRoom,
  deadline,
  disconnect,
  hello,
  loadState,
  message,
  nextTickAt,
  reattach,
  running,
  tick,
  type ConnId,
  type Effect,
  type Gen,
  type Identity,
  type Room,
  type State,
} from './room'

/** A socket's attachment: survives WebSocket hibernation, so the room finds its sockets again. */
type Attachment = { id: ConnId; ua: string; seat: number | null }

/** A socket not seated within this long is closed: no valid `hello`, or one whose auth is still being checked. */
const HELLO_TIMEOUT_MS = 10_000

/** Ticks of the log per catch-up frame. */
const TAIL_FRAME_TICKS = 600

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS log (run INTEGER NOT NULL, tick INTEGER NOT NULL, e TEXT NOT NULL, PRIMARY KEY (run, tick)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS hashes (run INTEGER NOT NULL, tick INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (run, tick)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS snaps (run INTEGER NOT NULL, tick INTEGER NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (run, tick, part)) WITHOUT ROWID',
]

const PHASES: readonly Phase[] = ['lobby', 'playing', 'ended']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The room this object saved (its own JSON), checked for the fields everything else relies on. */
const isRoom = (v: unknown): v is Room =>
  isRecord(v) && typeof v.code === 'string' && typeof v.build === 'string' && PHASES.some((p) => p === v.phase) && Array.isArray(v.seats) && Array.isArray(v.banned)

const isAttachment = (v: unknown): v is Attachment =>
  isRecord(v) && typeof v.id === 'string' && typeof v.ua === 'string' && (v.seat === null || typeof v.seat === 'number')

const randomToken = (bytes: number) => {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const gen: Gen = { secret: () => randomToken(24), seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 }

/** One JWKS cache per isolate, shared by the rooms it runs. */
let jwks: ReturnType<typeof jwksKeys> | null = null

/**
 * One co-op room. A class only because the Durable Object runtime asks for
 * one: it is a thin shell over the pure room (`room.ts`), doing the storage,
 * the sockets and the timers the room's effects ask for.
 */
export class RoomObject extends DurableObject<Env> {
  private state: State = loadState(null, gen, 0)
  private sockets = new Map<ConnId, WebSocket>()
  private attached = new Map<ConnId, Attachment>()
  private authing = new Set<ConnId>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private alarmAt: number | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      const now = Date.now()
      this.state = loadState(this.readRoom(), gen, now)
      const back = ctx.getWebSockets().flatMap((ws) => {
        const a: unknown = ws.deserializeAttachment()
        if (!isAttachment(a)) return []
        this.sockets.set(a.id, ws)
        this.attached.set(a.id, a)
        return [a]
      })
      this.alarmAt = await ctx.storage.getAlarm()
      this.apply(reattach(this.state, back, now))
    })
  }

  /** Reserves the room (the Worker's `POST /rooms`). False when the code is taken. */
  async create(init: { code: string; build: string; region: string }): Promise<boolean> {
    const r = createRoom(this.state, init, Date.now())
    if (r.ok) for (const q of SCHEMA) this.ctx.storage.sql.exec(q)
    this.apply(r.effects)
    return r.ok
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 })
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    const id = crypto.randomUUID()
    const ua = (request.headers.get('User-Agent') ?? '').slice(0, 200)
    this.ctx.acceptWebSocket(server)
    const attachment: Attachment = { id, ua, seat: null }
    server.serializeAttachment(attachment)
    this.sockets.set(id, server)
    this.attached.set(id, attachment)
    connect(this.state, id, ua, Date.now())
    setTimeout(() => {
      const conn = this.state.live.conns.get(id)
      if (!conn || conn.seat !== null) return
      // A hello still authenticating is given up too: its late answer finds no socket (`hello` ignores it).
      this.closeSocket(id, 'refused')
      const ws = this.sockets.get(id)
      if (ws) this.dropSocket(ws)
    }, HELLO_TIMEOUT_MS)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const a: unknown = ws.deserializeAttachment()
    if (!isAttachment(a)) return
    const text = typeof raw === 'string' ? raw : null
    // Far past any limit: no client of ours sends that.
    if (text !== null && text.length > LIMITS.chunkMessage * 2) return this.closeSocket(a.id, 'abuse')
    const msg = text === null ? null : parseClientMessage(text)
    const conn = this.state.live.conns.get(a.id)
    if (msg?.t === 'hello' && conn && conn.seat === null && !this.authing.has(a.id)) {
      this.authing.add(a.id)
      const identity = await this.identify(msg.auth).catch(() => null)
      this.authing.delete(a.id)
      this.apply(hello(this.state, a.id, msg, identity, Date.now()))
      return
    }
    this.apply(message(this.state, a.id, msg, Date.now()))
  }

  async webSocketClose(ws: WebSocket) {
    this.dropSocket(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.dropSocket(ws)
  }

  async alarm() {
    this.alarmAt = null
    this.apply(tick(this.state, Date.now()))
  }

  private dropSocket(ws: WebSocket) {
    const a: unknown = ws.deserializeAttachment()
    if (!isAttachment(a)) return
    this.sockets.delete(a.id)
    this.attached.delete(a.id)
    this.apply(disconnect(this.state, a.id, Date.now()))
  }

  private async identify(auth: Auth): Promise<Identity | null> {
    if (auth.kind === 'guest') return { id: `g:${auth.id}`, account: false }
    jwks ??= jwksKeys(`${this.env.CLERK_ISSUER}/.well-known/jwks.json`)
    const sub = await verifyClerkToken(auth.token, {
      keys: jwks,
      issuer: this.env.CLERK_ISSUER,
      allowedParty: (origin) => allowedOrigin(this.env, origin),
      now: Date.now(),
    })
    return sub ? { id: `u:${sub}`, account: true } : null
  }

  private readRoom(): Room | null {
    const sql = this.ctx.storage.sql
    const hasSchema = sql.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv'").toArray().length > 0
    if (!hasSchema) return null
    const row = sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = 'room'").toArray()[0]
    if (!row) return null
    const v: unknown = JSON.parse(row.v)
    return isRoom(v) ? v : null
  }

  private send(id: ConnId, text: string) {
    try {
      this.sockets.get(id)?.send(text)
    } catch {
      // The socket is closing; its close event cleans up.
    }
  }

  private closeSocket(id: ConnId, reason: keyof typeof CLOSE_CODES) {
    const ws = this.sockets.get(id)
    if (!ws) return
    try {
      ws.close(CLOSE_CODES[reason], reason)
    } catch {
      // Already closed.
    }
  }

  /**
   * Applies the room's effects: every storage write first (the room saved
   * once), then the messages and closes in order, so the output gate holds
   * each message until what it reflects is durable. Then sets the timers.
   */
  private apply(effects: readonly Effect[]) {
    const sql = this.ctx.storage.sql
    let save = false
    for (const e of effects) {
      if (e.k === 'save') save = true
      else if (e.k === 'log') sql.exec('INSERT OR REPLACE INTO log (run, tick, e) VALUES (?, ?, ?)', e.run, e.tick, JSON.stringify(e.entries))
      else if (e.k === 'hashes') sql.exec('INSERT OR REPLACE INTO hashes (run, tick, v) VALUES (?, ?, ?)', e.run, e.tick, JSON.stringify(e.bySeat))
      else if (e.k === 'chunk') sql.exec('INSERT OR REPLACE INTO snaps (run, tick, part, data) VALUES (?, ?, ?, ?)', e.run, e.tick, e.part, e.data)
      else if (e.k === 'keepSnapshot') sql.exec('DELETE FROM snaps WHERE run = ? AND tick <> ?', e.run, e.tick)
      else if (e.k === 'dropSnapshot') sql.exec('DELETE FROM snaps WHERE run = ? AND tick = ?', e.run, e.tick)
      else if (e.k === 'dropRun') for (const table of ['log', 'hashes', 'snaps']) sql.exec(`DELETE FROM ${table} WHERE run = ?`, e.run)
    }
    const room = this.state.room
    if (save && room) sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('room', ?)", JSON.stringify(room))
    const texts = new Map<ServerMessage, string>()
    let wiped = false
    for (const e of effects) {
      if (e.k === 'send') {
        const text = texts.get(e.msg) ?? JSON.stringify(e.msg)
        texts.set(e.msg, text)
        this.send(e.to, text)
      } else if (e.k === 'sync') this.sendSync(e)
      else if (e.k === 'close') this.closeSocket(e.to, e.reason)
      else if (e.k === 'event') console.log(JSON.stringify({ ev: e.ev, ...e.data }))
      else if (e.k === 'dump') this.ctx.waitUntil(this.dump(e).catch((err: unknown) => console.log(JSON.stringify({ ev: 'dump.failed', error: String(err) }))))
      else if (e.k === 'wipe') wiped = true
    }
    if (wiped) return this.wipe()
    for (const [id, a] of this.attached) {
      const seat = this.state.live.conns.get(id)?.seat ?? null
      if (a.seat === seat) continue
      const next = { ...a, seat }
      this.attached.set(id, next)
      this.sockets.get(id)?.serializeAttachment(next)
    }
    this.schedule()
  }

  /** The frame timer while a run's clock runs; the alarm for everything else time does. */
  private schedule() {
    const run = this.state.room?.run
    if (running(this.state) && run) {
      if (this.timer === null) {
        this.timer = setTimeout(() => {
          this.timer = null
          this.apply(tick(this.state, Date.now()))
        }, Math.max(0, Math.ceil(nextTickAt(run) - Date.now())))
      }
    } else if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const at = deadline(this.state)
    if (at === this.alarmAt) return
    this.alarmAt = at
    void (at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at))
  }

  /** A sync: the message, the base snapshot's chunks, then the log from `from` to `to` in frames. */
  private sendSync(e: Extract<Effect, { k: 'sync' }>) {
    const sql = this.ctx.storage.sql
    const run = e.msg.run.id
    let msg = e.msg
    const base = msg.base
    const chunks = base
      ? sql.exec<{ part: number; data: string }>('SELECT part, data FROM snaps WHERE run = ? AND tick = ? ORDER BY part', run, base.tick).toArray()
      : []
    // A snapshot that isn't all there (it never should be) falls back to the seed.
    if (base && chunks.length !== base.parts) msg = { ...msg, base: null, from: 0 }
    this.send(e.to, JSON.stringify(msg))
    if (msg.base) for (const c of chunks) this.send(e.to, JSON.stringify({ t: 'snapPart', tick: msg.base.tick, part: c.part, data: c.data } satisfies ServerMessage))
    for (let from = msg.from; from < msg.to; from += TAIL_FRAME_TICKS) {
      const to = Math.min(msg.to, from + TAIL_FRAME_TICKS)
      const rows = sql.exec<{ tick: number; e: string }>('SELECT tick, e FROM log WHERE run = ? AND tick >= ? AND tick < ? ORDER BY tick', run, from, to).toArray()
      // Entries are stored as their JSON: spliced in as they are.
      this.send(e.to, `{"t":"frame","from":${from},"to":${to},"ticks":[${rows.map((r) => `[${r.tick},${r.e}]`).join(',')}]}`)
    }
  }

  /** Records a dump (a desync, a bad snapshot: room, run start, the whole input log, hashes per seat, builds and user agents) in the vault. */
  private async dump(e: Extract<Effect, { k: 'dump' }>) {
    const room = this.state.room
    if (!room?.run) return
    const sql = this.ctx.storage.sql
    const log = sql.exec<{ tick: number; e: string }>('SELECT tick, e FROM log WHERE run = ? ORDER BY tick', e.run).toArray()
    const hashes = sql.exec<{ tick: number; v: string }>('SELECT tick, v FROM hashes WHERE run = ? ORDER BY tick', e.run).toArray()
    const at = Date.now()
    const meta = {
      code: room.code,
      build: room.build,
      region: room.region,
      createdAt: room.createdAt,
      at,
      reason: e.reason,
      tick: e.tick,
      reports: e.reports,
      majority: e.majority,
      minority: e.minority,
      run: room.run.start,
      clock: { next: room.run.next, bound: room.run.bound, agreed: room.run.agreed },
      seats: room.seats.map((s) => ({ seat: s.seat, account: s.account, name: s.name, build: s.build, ua: s.ua })),
    }
    const body = `{"meta":${JSON.stringify(meta)},"log":[${log.map((r) => `[${r.tick},${r.e}]`).join(',')}],"hashes":[${hashes.map((r) => `[${r.tick},${r.v}]`).join(',')}]}`
    const bytes = await gzip(body)
    const id = `${room.code}-${e.run}-${e.tick}-${randomToken(3)}`
    await this.env.VAULT.getByName('dumps').put({ id, code: room.code, run: e.run, tick: e.tick, at, size: bytes.byteLength }, bytes)
    console.log(JSON.stringify({ ev: 'dump.saved', id, bytes: bytes.byteLength, logTicks: log.length }))
  }

  /** The room is over: storage, alarm and sockets go. */
  private wipe() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.alarmAt = null
    for (const id of [...this.sockets.keys()]) {
      this.send(id, JSON.stringify({ t: 'bye', reason: 'expired' } satisfies ServerMessage))
      this.closeSocket(id, 'expired')
    }
    this.state = loadState(null, gen, Date.now())
    // Atomic, and (compatibility date 2026-02-24 on) the alarm goes too.
    void this.ctx.storage.deleteAll()
  }
}
