import { describe, expect, it } from 'vitest'
import { PROTOCOL, TICK_HZ, type ClientMessage } from '../../src/net/protocol'
import { TIMES, connect, createRoom, disconnect, hello, loadState, message, tick, type Effect } from '../src/room'
import { LAB_MIN_TICKS, connOpened, createTelemetry, labScore, noteEffects, noteInbound, parseTrace, welcomeNet, type LabRun, type LogLine } from '../src/telemetry'

const T0 = 1_000_000
const EDGES = [
  { colo: 'GRU', country: 'BR', asn: 28573, rtt: 12 },
  { colo: 'EZE', country: 'AR', asn: 7303, rtt: 31 },
]

/** A room driven like the Durable Object drives it: every batch of effects goes through the telemetry. */
const drive = () => {
  const t = createTelemetry()
  t.where = { colo: 'MIA' }
  let n = 0
  const state = loadState(null, { secret: () => `secret-${String(++n).padStart(10, '0')}`, seed: () => 42 }, T0)
  const logs: LogLine[] = []
  const labs: LabRun[] = []
  const apply = (effects: readonly Effect[], now: number) => {
    const noted = noteEffects(t, state.room, effects, now)
    logs.push(...noted.logs)
    if (noted.lab) labs.push(noted.lab)
    return effects
  }
  apply(createRoom(state, { code: 'ABCDE', build: 'b1', region: 'enam' }, T0).effects, T0)
  const say = (conn: string, msg: ClientMessage, now: number) => {
    const c = state.live.conns.get(conn)
    const drops = c?.drops
    const effects = message(state, conn, msg, now)
    noteInbound(t, c?.seat ?? null, msg, JSON.stringify(msg).length, !!c && c.drops !== drops)
    return apply(effects, now)
  }
  EDGES.forEach((edge, i) => {
    connOpened(t, `c${i}`, edge, T0, 'ABCDE')
    connect(state, `c${i}`, 'ua', T0)
    const guest = `guest-${i}-xxxxxxxxxxxx`
    apply(hello(state, `c${i}`, { t: 'hello', v: PROTOCOL, build: 'b1', room: 'ABCDE', auth: { kind: 'guest', id: guest }, secret: null, name: `p${i}`, resume: null }, { id: `g:${guest}`, account: false }, T0, { guests: true }), T0)
    say(`c${i}`, { t: 'loadout', loadout: { starter: 'pichu' } }, T0)
    if (i > 0) say(`c${i}`, { t: 'ready', ready: true }, T0)
  })
  say('c0', { t: 'start' }, T0)
  /** Plays `ticks` ticks from `from`: seat 0 moves its stick twice every other tick, in one batch (one is coalesced), seat 1 beats once a second. */
  const play = (from: number, ticks: number) => {
    const t0 = T0 + TIMES.startDelay
    for (let k = from; k < from + ticks; k++) {
      const now = t0 + Math.ceil(((k + 1) * 1000) / TICK_HZ)
      if (k % 2 === 0) {
        say('c0', { t: 'batch', m: [{ t: 'in', k: 'move', d: [k % 9, 2 * k] }, { t: 'in', k: 'move', d: [(k + 1) % 9, 2 * k + 1] }] }, now - 2)
      }
      if (k % TICK_HZ === 0) say('c1', { t: 'hb' }, now - 1)
      apply(tick(state, now), now)
    }
    return t0 + Math.ceil(((from + ticks) * 1000) / TICK_HZ)
  }
  return { t, state, logs, labs, say, play, apply }
}

describe('telemetry', () => {
  it('sums a run up at its end: each frame once, the stick coalesced, the seats where they connect', () => {
    const d = drive()
    const end = d.play(0, LAB_MIN_TICKS)
    d.say('c1', { t: 'net', rtt: 140, rtt95: 220, hold: 6, underruns: 3, stalls: 9, reconnects: 1 }, end)
    d.say('c0', { t: 'over', tick: LAB_MIN_TICKS, h: 'end' }, end)
    d.say('c1', { t: 'over', tick: LAB_MIN_TICKS, h: 'end' }, end + 1)
    const summary = d.logs.find((l) => l.ev === 'run.summary')
    expect(summary).toMatchObject({ code: 'ABCDE', run: 1, why: 'over', final: true, colo: 'MIA', region: 'enam', ticks: LAB_MIN_TICKS, frames: LAB_MIN_TICKS, multiTick: 0 })
    expect(summary).toMatchObject({ moveIn: LAB_MIN_TICKS, moveOut: LAB_MIN_TICKS / 2, coalesced: LAB_MIN_TICKS / 2, dropped: 0 })
    // A batch counts once, and each message it carries by its kind.
    expect(summary?.inbound).toMatchObject({ batch: LAB_MIN_TICKS / 2, in: LAB_MIN_TICKS })
    expect(summary?.seats).toEqual([
      expect.objectContaining({ seat: 0, colo: 'GRU', opens: 1 }),
      expect.objectContaining({ seat: 1, colo: 'EZE', rtt95: 220, underruns: 3 }),
    ])
    // Worth keeping: long enough, scored by its laggiest seat.
    expect(d.labs).toEqual([expect.objectContaining({ run: 1, tick: LAB_MIN_TICKS, why: 'over', score: 220 + 20 * 3 + 50 })])
    expect(d.t.run).toBeNull()
  })

  it('sums up a run dropped with its room, without keeping a short one for the lab', () => {
    const d = drive()
    const end = d.play(0, 120)
    d.say('c0', { t: 'leave' }, end)
    d.say('c1', { t: 'leave' }, end)
    expect(d.state.room).toBeNull()
    expect(d.logs.filter((l) => l.ev === 'run.summary')).toEqual([expect.objectContaining({ run: 1, why: 'empty', ticks: 120 })])
    expect(d.labs).toEqual([])
  })

  it('sums up and offers a run everyone dropped out of, which goes on counting', () => {
    const d = drive()
    const end = d.play(0, LAB_MIN_TICKS)
    d.apply(disconnect(d.state, 'c0', end), end)
    d.apply(disconnect(d.state, 'c1', end), end)
    expect(d.logs).toEqual([expect.objectContaining({ ev: 'run.summary', why: 'left', final: false, ticks: LAB_MIN_TICKS })])
    expect(d.labs).toEqual([expect.objectContaining({ why: 'left', tick: LAB_MIN_TICKS })])
    expect(d.t.run).not.toBeNull()
  })

  it('tells a welcome where the room runs and where its socket meets Cloudflare', () => {
    const d = drive()
    expect(welcomeNet(d.t, 'c1', d.state.room)).toEqual({ colo: 'MIA', region: 'enam', edge: 'EZE', edgeRtt: 31 })
    expect(parseTrace('fl=1\nh=x\nip=1.2.3.4\ncolo=GRU\nloc=BR\n')).toEqual({ colo: 'GRU' })
  })

  it('scores a run by its worst seat, from the edge when a seat never reported', () => {
    expect(labScore({ reports: {}, edges: { 0: EDGES[0]!, 1: EDGES[1]! } })).toBe(31)
    expect(labScore({ reports: { 0: { rtt: 100, rtt95: 150, hold: 4, underruns: 0, stalls: 0, reconnects: 2 } }, edges: { 1: EDGES[1]! } })).toBe(250)
  })
})
