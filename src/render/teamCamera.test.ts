import { describe, expect, it } from 'vitest'
import { createLocalGame } from '../coopLocal'
import { createTeamCamera, cycleWatched, spectating, updateTeamCamera, watched } from './teamCamera'

describe('team camera', () => {
  it('follows the client while they stand, and a standing teammate while they lie fainted', () => {
    const g = createLocalGame(3, ['charmander', 'squirtle', 'bulbasaur'], 7)
    const [me, a, b] = g.players as [typeof g.players[0], typeof g.players[0], typeof g.players[0]]
    const cam = createTeamCamera()
    expect(watched(cam, g, me)).toBe(me)
    me.hp = 0
    expect(spectating(g, me)).toBe(true)
    expect(watched(cam, g, me)).toBe(a)
    cycleWatched(cam, g, me)
    expect(watched(cam, g, me)).toBe(b)
    // The one watched faints too: on to the next one standing.
    b.hp = 0
    expect(watched(cam, g, me)).toBe(a)
    me.hp = 10
    expect(watched(cam, g, me)).toBe(me)
  })

  it('snaps on the first frame and frames the player a little above their feet', () => {
    const g = createLocalGame(2, ['charmander', 'squirtle'], 7)
    const me = g.players[0]!
    const cam = updateTeamCamera(createTeamCamera(), g, me, 200, 100, 1 / 60)
    expect(cam.x).toBe(me.x - 100)
    expect(cam.y).toBe(me.y - 10 - 50)
  })
})
