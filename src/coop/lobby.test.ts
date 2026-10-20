import { describe, expect, it } from 'vitest'
import type { CoopInvite } from '../game/friends'
import type { Member, RoomView } from '../net/protocol'
import { betaOn, freshInvites, memberState, readiness } from './lobby'

const member = (seat: number, o: Partial<Member> = {}): Member => ({
  seat,
  name: `P${seat}`,
  account: false,
  host: seat === 0,
  online: true,
  away: false,
  ready: false,
  loadout: { starter: 'charmander' },
  ...o,
})

const room = (members: Member[]): RoomView => ({ code: 'K7QF2', phase: 'lobby', members, settings: {}, run: 0 })

describe('memberState', () => {
  it('says the most pressing thing first', () => {
    expect(memberState(member(0, { online: false }))).toBe('offline')
    expect(memberState(member(1, { away: true, ready: true }))).toBe('away')
    expect(memberState(member(0))).toBe('host')
    expect(memberState(member(1, { ready: true }))).toBe('ready')
    expect(memberState(member(1))).toBe('picking')
  })

  it('a ready member without a Pokémon is still choosing', () => {
    expect(memberState(member(1, { ready: true, loadout: null }))).toBe('picking')
  })
})

describe('readiness', () => {
  it('counts the host as set and waits on the others online', () => {
    expect(readiness(room([member(0), member(1)]))).toEqual({ ready: 1, total: 2, all: false })
    expect(readiness(room([member(0), member(1, { ready: true })]))).toEqual({ ready: 2, total: 2, all: true })
  })

  it("doesn't wait on members who went offline", () => {
    expect(readiness(room([member(0), member(1, { ready: true }), member(2, { online: false })]))).toEqual({ ready: 2, total: 2, all: true })
  })

  it('a host alone can start', () => {
    expect(readiness(room([member(0)])).all).toBe(true)
  })
})

describe('betaOn', () => {
  it('lets the device override win both ways', () => {
    expect(betaOn({ dev: true, override: 'off', flag: true })).toBe(false)
    expect(betaOn({ dev: false, override: 'on', flag: false })).toBe(true)
  })

  it('shows in dev builds, else only when the flag says so', () => {
    expect(betaOn({ dev: true, override: null, flag: null })).toBe(true)
    expect(betaOn({ dev: false, override: null, flag: null })).toBe(false)
    expect(betaOn({ dev: false, override: null, flag: true })).toBe(true)
  })
})

describe('freshInvites', () => {
  const invite = (id: string, room: string, expiresAt = '2026-10-20T12:10:00Z'): CoopInvite => ({ id, from: { handle: 'ash', name: 'Ash' }, room, at: '2026-10-20T12:00:00Z', expiresAt })
  const now = Date.parse('2026-10-20T12:05:00Z')

  it('skips what was shown, what expired and the room the player is in', () => {
    const list = [invite('a', 'AAAAA'), invite('b', 'BBBBB'), invite('c', 'CCCCC', '2026-10-20T12:04:00Z'), invite('d', 'K7QF2')]
    expect(freshInvites(list, new Set(['a']), 'K7QF2', now).map((i) => i.id)).toEqual(['b'])
  })
})
