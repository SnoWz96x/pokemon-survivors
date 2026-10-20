import { describe, expect, it } from 'vitest'
import { chooseOffer, createGame, createPlayer, step } from './game'
import { recomputeStats } from './leveling'
import { NO_RANKS } from './meta'
import { spawnHazard, updateHazards } from './bosses'
import { enterPlace, exitPlace } from './placeInterior'
import { actAs, anchorPlayer, ARRIVAL_GAP, localPlayer, nearestPlayer, onAnyScreen, phaseOf, playerWithin } from './players'
import type { Game } from './types'

const view = { w: 480, h: 270 }

/** A solo run with a second player standing `dx` px to the right (the co-op rules PR builds real ones). */
const duo = (dx = 200): Game => {
  const g = createGame('charmander', { ...view }, 5)
  const p2 = createPlayer(1, { starter: 'squirtle', ranks: NO_RANKS, shiny: false }, false, dx, g.view)
  g.players.push(p2)
  const before = actAs(g, p2)
  recomputeStats(g)
  actAs(g, before)
  p2.hp = p2.stats.maxHp
  return g
}

describe('players', () => {
  it('give world systems the nearest standing player, and skip fainted ones', () => {
    const g = duo()
    const [p1, p2] = g.players
    expect(nearestPlayer(g, 150, 0)).toBe(p2)
    expect(nearestPlayer(g, 20, 0)).toBe(p1)
    p2!.hp = 0
    expect(nearestPlayer(g, 150, 0)).toBe(p1)
    expect(playerWithin(g, 200, 0, 10)).toBeNull()
  })

  it('take turns as the anchor of world events, and solo it is always the player', () => {
    const g = duo()
    expect([anchorPlayer(g, 0), anchorPlayer(g, 1), anchorPlayer(g, 2)].map((p) => p.slot)).toEqual([0, 1, 0])
    const solo = createGame('charmander', { ...view }, 5)
    expect(anchorPlayer(solo, 7)).toBe(localPlayer(solo))
  })

  it('count a spot as on screen when any player sees it', () => {
    const g = duo(1000)
    step(g, { move: { x: 0, y: 0 }, special: false }, 1 / 60)
    expect(onAnyScreen(g, 1000, 0)).toBe(true)
    expect(onAnyScreen(g, 500, 0)).toBe(false)
  })

  it('each pick belongs to its player: the world waits until both have picked', () => {
    const g = duo()
    const [p1, p2] = g.players
    for (const p of g.players) p.pendingLevelUps = 1
    step(g, { move: { x: 0, y: 0 }, special: false }, 1 / 60)
    expect([g.phase, phaseOf(g, p1), phaseOf(g, p2)]).toEqual(['levelup', 'levelup', 'levelup'])
    expect(p1!.offers.length).toBeGreaterThan(0)
    expect(p2!.offers.length).toBeGreaterThan(0)
    chooseOffer(g, p2!.offers[0]!, p2)
    expect([g.phase, phaseOf(g, p1), phaseOf(g, p2), p2!.pendingLevelUps]).toEqual(['levelup', 'levelup', 'playing', 0])
    chooseOffer(g, p1!.offers[0]!, p1)
    expect(g.phase).toBe('playing')
  })

  it('take the whole team into a room and back out, side by side, each screen on its player', () => {
    const g = duo()
    const [p1, p2] = g.players
    enterPlace(g, 'graveyard', 1000, 0)
    expect([p2!.y - p1!.y, p2!.x - p1!.x]).toEqual([0, ARRIVAL_GAP])
    expect([p1!.iframes > 0, p2!.iframes > 0]).toEqual([true, true])
    expect([p2!.screen.x - p1!.screen.x, g.camera.x]).toEqual([ARRIVAL_GAP, p1!.screen.x])
    exitPlace(g, 'done')
    expect([g.place.inside, p2!.x - p1!.x, p2!.y - p1!.y]).toEqual([null, ARRIVAL_GAP, 0])
  })

  it('let a hazard hurt whichever player it touches', () => {
    const g = duo()
    const [p1, p2] = g.players
    const hp = [p1!.hp, p2!.hp]
    spawnHazard(g, { kind: 'zone', visual: 'fire', x: p2!.x, y: p2!.y, r: 8, damage: 5, ttl: 1 })
    updateHazards(g, 1 / 60)
    expect([p1!.hp, p2!.hp < hp[1]!]).toEqual([hp[0], true])
    expect(g.player).toBe(p1)
  })
})
