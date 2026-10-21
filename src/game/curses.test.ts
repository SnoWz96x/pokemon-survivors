import { describe, expect, it } from 'vitest'
import { CURSE_IDS } from '../data/curses'
import { blocksNewMoves, chestCurse, CURSE, curseDrain } from './curses'
import { curseCast } from './curseSystem'
import { chooseOffer, createGame } from './game'
import { loadout, offerPool } from './leveling'
import { maxMoveLevel } from './moves'
import { setPhase } from './players'

/** An rng that plays back `rolls`, then 0s. */
const rolls = (...values: number[]) => () => values.shift() ?? 0

describe('cursed items in chests', () => {
  it('only turn up after their start time, on the chance roll, and never past the cap', () => {
    expect(chestCurse([], CURSE.from - 1, rolls(0, 0))).toBeNull()
    expect(chestCurse([], CURSE.from, rolls(CURSE.chance, 0))).toBeNull()
    expect(chestCurse([], CURSE.from, rolls(0, 0))).toBe(CURSE_IDS[0])
    expect(chestCurse(CURSE_IDS.slice(0, CURSE.max), 600, rolls(0, 0))).toBeNull()
  })

  it('pick one not held yet', () => {
    const held = [CURSE_IDS[0]!]
    for (const roll of [0, 0.4, 0.99]) {
      const id = chestCurse(held, 600, rolls(0, roll))
      expect(id).not.toBeNull()
      expect(held).not.toContain(id)
    }
  })
})

describe('cursed item rules', () => {
  it('wear the player down without ever making them faint', () => {
    expect(curseDrain(50, 100, 0.01)).toBe(49)
    expect(curseDrain(1.5, 100, 0.01)).toBe(1)
    expect(curseDrain(0.5, 100, 0.01)).toBe(0.5)
  })

  it('Choice Band: upgrades only, no new moves', () => {
    expect(blocksNewMoves(['lifeOrb'])).toBe(false)
    const g = createGame('charmander', { w: 400, h: 240 }, 3)
    g.player.curses.held.push('choiceBand')
    const pool = offerPool(loadout(g)).map(([o]) => o)
    expect(pool.some((o) => o.kind === 'move' && o.level === 1)).toBe(false)
    expect(pool.some((o) => o.kind === 'move' && o.id === 'ember' && o.level === 2)).toBe(true)
    expect(pool.some((o) => o.kind === 'item')).toBe(true)
  })

  it('Life Orb: a cast costs 1% of max HP, at most once a second', () => {
    const g = createGame('charmander', { w: 400, h: 240 }, 3)
    g.player.curses.held.push('lifeOrb')
    const max = g.player.stats.maxHp
    curseCast(g)
    curseCast(g)
    expect(g.player.hp).toBeCloseTo(max * (1 - CURSE.lifeOrb.cost))
    g.now += CURSE.lifeOrb.gap
    curseCast(g)
    expect(g.player.hp).toBeCloseTo(max * (1 - 2 * CURSE.lifeOrb.cost))
  })

  it('are taken or left through the chest’s two cards, and their power counts', () => {
    const g = createGame('charmander', { w: 400, h: 240 }, 3)
    const might = g.player.stats.might
    g.player.moves[0]!.level = maxMoveLevel('ember')
    setPhase(g, 'curse')
    g.player.offers = [{ kind: 'curse', id: 'ironBall', take: true }, { kind: 'curse', id: 'ironBall', take: false }]
    chooseOffer(g, g.player.offers[0]!)
    expect(g.phase).toBe('playing')
    expect(g.player.curses.held).toEqual(['ironBall'])
    expect(g.player.stats.might).toBeCloseTo(might + 0.3)

    setPhase(g, 'curse')
    g.player.offers = [{ kind: 'curse', id: 'lifeOrb', take: true }, { kind: 'curse', id: 'lifeOrb', take: false }]
    chooseOffer(g, g.player.offers[1]!)
    expect(g.player.curses.held).toEqual(['ironBall'])
  })
})
