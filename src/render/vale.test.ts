import { describe, expect, it } from 'vitest'
import { VALE } from '../data/versus'
import { onFloor, zoneAt } from './vale'
import { versusTag } from './team'

describe('the Vale floor', () => {
  it('has the spawn pads, the goals and the camps on the floor, and the hedge around it', () => {
    for (const p of [...VALE.spawn, ...VALE.goals, ...VALE.camps]) expect(onFloor(p.x, p.y)).toBe(true)
    expect(onFloor(200, -190)).toBe(false)
    expect(onFloor(800, 0)).toBe(false)
  })

  it('tells the bases, the lanes and the jungle apart', () => {
    expect(zoneAt(-700, 0)).toBe('base')
    expect(zoneAt(700, 100)).toBe('base')
    expect(zoneAt(0, -300)).toBe('lane')
    expect(zoneAt(100, 50)).toBe('jungle')
    expect(zoneAt(-350, 190)).toBe('passage')
  })
})

describe('versusTag', () => {
  it("writes a human's name, and a bot's Pokémon", () => {
    expect(versusTag('@ana', 'Bulbasaur', 0)).toBe('ANA')
    expect(versusTag('', 'Charmander', 3)).toBe('CHARMANDER')
    expect(versusTag('', 'Flabébé', 3)).toBe('FLABEBE')
  })
})
