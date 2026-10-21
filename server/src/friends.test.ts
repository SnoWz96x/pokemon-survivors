import { describe, expect, it } from 'vitest'
import { PRESENCE } from '../../src/game/friends'
import { toFriendPresence } from './friends'

describe('toFriendPresence', () => {
  const row = { handle: 'ash', name: 'Ash', appear_offline: false, activity: 'room', room: 'K7QF2', ago: 1000 } as const

  it('shows an online friend with their room', () => {
    expect(toFriendPresence(row)).toEqual({ handle: 'ash', name: 'Ash', online: true, activity: 'room', room: 'K7QF2' })
  })

  it('hides activity and room of a friend appearing offline, or whose heartbeat ran out', () => {
    const hidden = { handle: 'ash', name: 'Ash', online: false, activity: null, room: null }
    expect(toFriendPresence({ ...row, appear_offline: true })).toEqual(hidden)
    expect(toFriendPresence({ ...row, ago: 3 * PRESENCE.beatMs.room })).toEqual(hidden)
    expect(toFriendPresence({ ...row, activity: null, room: null, ago: null })).toEqual(hidden)
  })
})
