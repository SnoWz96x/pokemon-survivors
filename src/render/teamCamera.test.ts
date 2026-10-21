import { describe, expect, it } from 'vitest'
import { PLAYABLE_IDS } from '../data/hatchlings'
import { COOP } from '../data/coop'
import { createCoopGame } from '../game/game'
import { NO_RANKS } from '../game/meta'
import { createTeamCamera, cycleWatched, spectating, updateTeamCamera, watched } from './teamCamera'

const createLocalGame = (n: number, starters: readonly (typeof PLAYABLE_IDS)[number][], seed: number) =>
  createCoopGame(seed, starters.slice(0, n).map((starter, i) => ({ starter, ranks: NO_RANKS, shiny: false, name: `P${i + 1}` })), { draft: false })

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

  it('eases a switch all the way down to half a pixel, never cutting the last stretch', () => {
    const g = createLocalGame(2, ['charmander', 'squirtle'], 7)
    const [me, mate] = g.players as [typeof g.players[0], typeof g.players[0]]
    mate.x = me.x + 300
    const cam = createTeamCamera()
    updateTeamCamera(cam, g, me, 200, 100, 1 / 60)
    me.hp = 0
    const left: number[] = []
    for (let i = 0; i < 120; i++) {
      // The teammate walks on while the view comes over: it never lags them.
      mate.x += 1
      updateTeamCamera(cam, g, me, 200, 100, 1 / 60)
      left.push(Math.abs(cam.x - (mate.x - 100)))
    }
    const settled = left.indexOf(0)
    expect(settled).toBeGreaterThan(24)
    expect(left.slice(0, settled).every((d, i) => i === 0 || d < left[i - 1]!)).toBe(true)
    expect(left[settled - 1]).toBeLessThan(0.6)
    expect(left.slice(settled).every((d) => d === 0)).toBe(true)
  })

  it("frames this player's own screen while a wave legendary's scene pans it, even spectating", () => {
    const g = createLocalGame(2, ['charmander', 'squirtle'], 7)
    const [me, mate] = g.players as [typeof g.players[0], typeof g.players[0]]
    mate.x = me.x + 300
    me.hp = 0
    me.screen = { x: me.x + 40, y: me.y - 500 }
    g.legendScene = { kind: 'entrance', enemy: 'zapdos', bossId: 1, t: 0, capture: null, next: [], then: null }
    const cam = updateTeamCamera(createTeamCamera(), g, me, 200, 100, 1 / 60)
    expect(cam.x).toBe(me.screen.x + COOP.view.w / 2 - 100)
    expect(cam.y).toBe(me.screen.y + COOP.view.h / 2 - 50)
    // The scene over, the spectator's view goes back to the teammate.
    g.legendScene = null
    updateTeamCamera(cam, g, me, 200, 100, 1 / 60)
    expect(cam.follow).toBe(mate.slot)
  })
})
