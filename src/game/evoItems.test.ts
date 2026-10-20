import { describe, expect, it } from 'vitest'
import { PLAYABLE } from '../data/hatchlings'
import { BOTTLE_CAPS, EVO_ITEM_PRICE, type ShopLevel } from '../data/shop'
import { buyCap, buyEvoItem, capBlock, evoBlock, mergeCaps, mergeEvoItems, parseCaps, parseEvoItems, runBoost } from './evoItems'
import { advancePhase, chooseOffer } from './game'
import { EMPTY_SAVE, NO_RANKS, type Save } from './meta'
import { parseReplay, startGame, type ReplayStart } from './replay'
import { NO_SHOP } from './shop'
import { BASE_STATS, boostStats } from './stats'
import type { Game } from './types'

const START: ReplayStart = { seed: 7, starter: 'charmander', difficulty: 'normal', ranks: NO_RANKS, shiny: false, luckyEgg: false, outbreak: null, halloween: false, bag: [], view: { w: 480, h: 270 } }

const save = (wallet: number, level: ShopLevel): Save => ({ ...EMPTY_SAVE, wallet, shop: { ...NO_SHOP, level } })

describe('evolution items', () => {
  it('are bought once from the Shop (Lv 3), into `spent`, and merge as a union', () => {
    expect(evoBlock(save(1e6, 2), 'iceStone')).toBe('locked')
    expect(evoBlock(save(100, 3), 'iceStone')).toBe('poor')
    const bought = buyEvoItem(save(20_000, 3), 'iceStone')!
    expect(bought).toMatchObject({ wallet: 20_000 - EVO_ITEM_PRICE, spent: EVO_ITEM_PRICE, evo: ['iceStone'] })
    expect(buyEvoItem(bought, 'iceStone')).toBeNull()
    expect(mergeEvoItems(['iceStone'], ['waterStone', 'iceStone'])).toEqual(['waterStone', 'iceStone'])
    expect(parseEvoItems(['iceStone', 'rock', 'iceStone'])).toEqual(['iceStone'])
  })
})

describe('Bottle Caps', () => {
  it('cost 2k, 6k and 18k for one Pokémon, from the Shop (Lv 3), and stop at 3', () => {
    expect(capBlock(save(1e6, 2), 'charmander')).toBe('locked')
    let s = save(26_000, 3)
    for (const price of BOTTLE_CAPS.prices) {
      const before = s.wallet
      s = buyCap(s, 'charmander')!
      expect(before - s.wallet).toBe(price)
    }
    expect(s.caps).toEqual({ charmander: 3 })
    expect(s.spent).toBe(26_000)
    expect(capBlock({ ...s, wallet: 1e6 }, 'charmander')).toBe('max')
    expect(capBlock(s, 'squirtle')).toBe('poor')
  })

  it('add 3% per level to HP, power and speed and take it off the damage taken; an Everstone adds 15%', () => {
    expect(runBoost(0, [])).toBe(0)
    expect(runBoost(3, [])).toBeCloseTo(0.09)
    expect(runBoost(2, ['everstone', 'lure'])).toBeCloseTo(0.21)
    const s = boostStats(BASE_STATS, 0.09)
    expect(s.maxHp).toBe(109)
    expect(s.might).toBeCloseTo(1.09)
    expect(s.speed).toBeCloseTo(BASE_STATS.speed * 1.09)
    expect(s.damageTaken).toBeCloseTo(1 / 1.09)
    expect(boostStats(BASE_STATS, 0)).toBe(BASE_STATS)
  })

  it("apply only to the run's Pokémon (its level rides in the replay), a legend included", () => {
    const plain = startGame(START)
    const capped = startGame({ ...START, caps: 3 })
    expect(capped.player.stats.might).toBeCloseTo(plain.player.stats.might * 1.09)
    const legend = startGame({ ...START, starter: 'kyogre', caps: 2 })
    expect(legend.player.stats.might).toBeCloseTo(startGame({ ...START, starter: 'kyogre' }).player.stats.might * 1.06)
    expect(parseReplay({ rules: 30, start: { ...START, caps: 4 }, moves: [], events: [] })).toBeNull()
    expect(parseReplay({ rules: 30, start: { ...START, caps: 2 }, moves: [], events: [] })?.start.caps).toBe(2)
  })

  it('merge each Pokémon at its higher level, and parse within 1..3', () => {
    expect(mergeCaps({ charmander: 1, eevee: 3 }, { charmander: 2 })).toEqual({ charmander: 2, eevee: 3 })
    expect(parseCaps({ charmander: 9, nope: 2, eevee: 0, squirtle: 1.7 })).toEqual({ charmander: 3, squirtle: 1 })
  })
})

describe('the Everstone', () => {
  /** A run levelled far past both evolutions, every pick the first card. */
  const levelled = (bag: ReplayStart['bag']): { g: Game; phases: Set<string> } => {
    const g = startGame({ ...START, bag })
    const phases = new Set<string>()
    chooseOffer(g, g.player.offers[0]!)
    g.player.level = 40
    g.player.pendingLevelUps = 1
    advancePhase(g)
    for (let i = 0; i < 50 && g.phase !== 'playing'; i++) {
      phases.add(g.phase)
      if (g.phase === 'evolving') g.phase = 'playing'
      else chooseOffer(g, g.player.offers[0]!)
    }
    return { g, phases }
  }

  it('holds the run in its first form, still picks the Ability, and makes it 15% stronger', () => {
    const { g, phases } = levelled(['everstone'])
    expect(g.player.stage).toBe(0)
    expect(phases.has('evolving')).toBe(false)
    expect(phases.has('ability')).toBe(true)
    expect(g.player.ability.id).not.toBeNull()
    expect(g.player.everstone).toBe(true)
    expect(g.player.level).toBeGreaterThan(PLAYABLE.charmander.line[1].evolveAt!)
    const plain = startGame(START)
    expect(startGame({ ...START, bag: ['everstone'] }).player.stats.maxHp).toBe(Math.round(plain.player.stats.maxHp * 1.15))
  })

  it('changes nothing in a run without it', () => {
    const { phases } = levelled([])
    expect(phases.has('evolving')).toBe(true)
  })
})
