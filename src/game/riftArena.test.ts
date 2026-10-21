import { describe, expect, it } from 'vitest'
import { RIFT } from '../data/rifts'
import { hurtPlayer } from './combat'
import { createGame, step } from './game'
import { enterArena } from './riftArena'

const DT = 1 / 60
const still = { move: { x: 0, y: 0 }, special: false }

describe('falling in a rift arena', () => {
  it('holds the world while the rift throws the player out, then lands them back alive with their Revive kept', () => {
    const g = createGame('charmander', { w: 480, h: 270 }, 1)
    const outside = g.enemies
    g.player.revives = 1
    enterArena(g, 'lugia', g.player.x, g.player.y)
    g.player.iframes = 0
    hurtPlayer(g, g.player.stats.maxHp * 100)
    expect(g.phase).toBe('playing')
    expect(g.rift.arena?.fall).toBe(RIFT.fallTime)

    const time = g.time
    for (let t = 0; t < RIFT.fallTime - DT; t += DT) step(g, still, DT)
    expect(g.time).toBe(time)
    expect(g.rift.arena).not.toBeNull()
    step(g, still, DT)

    expect(g.rift.arena).toBeNull()
    expect(g.enemies).toBe(outside)
    expect(g.player.hp).toBe(Math.round(g.player.stats.maxHp * RIFT.fallHp))
    expect(g.player.revives).toBe(1)
    expect(g.rift.cleared).toEqual([])
    expect(g.events.some((e) => e.kind === 'riftExit' && e.outcome === 'fallen')).toBe(true)
  })
})
