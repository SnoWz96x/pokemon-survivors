import { describe, expect, it } from 'vitest'
import { spawnEnemy } from './enemies'
import { advancePhase, chooseOffer, step } from './game'
import { NO_RANKS } from './meta'
import { startGame, TICK, type ReplayStart } from './replay'
import { SKETCH, SKETCH_BOSS, SKETCH_COPY, sketchPick } from './sketch'
import { spawnWaveBoss } from './spawner'
import type { Game } from './types'

const START: ReplayStart = { seed: 9, starter: 'smeargle', difficulty: 'normal', ranks: NO_RANKS, shiny: false, luckyEgg: false, outbreak: null, halloween: false, bag: [], view: { w: 480, h: 270 } }
const STILL = { move: { x: 0, y: 0 }, special: false }

/** Smeargle past its opening draft, standing still. */
const smeargle = (seed = START.seed): Game => {
  const g = startGame({ ...START, seed })
  if (g.phase === 'levelup') chooseOffer(g, g.player.offers[0]!)
  return g
}

const sketchOf = (g: Game) => g.player.moves.find((m) => m.id === 'sketch')!

describe('Sketch', () => {
  it('paints the move of the model’s first type, a boss’s stronger one, and from memory with no model', () => {
    expect(sketchPick({ types: ['fire', 'flying'], boss: false }, 0.5)).toBe('ember')
    expect(sketchPick({ types: ['rock', 'ground'], boss: true }, 0.5)).toBe(SKETCH_BOSS.rock)
    // A boss whose type has no stronger move lends the plain one.
    expect(sketchPick({ types: ['dark'], boss: true }, 0.5)).toBe(SKETCH_COPY.dark)
    const memory = Object.values(SKETCH_COPY)
    expect(sketchPick(null, 0)).toBe(memory[0])
    expect(sketchPick(null, 0.999)).toBe(memory[memory.length - 1])
  })

  it('copies the nearest foe, casts the painting a few times as its own hits, then paints again', () => {
    const g = smeargle()
    const p = g.player
    spawnEnemy(g, 'vulpix', p.x + 40, p.y)
    const owned = sketchOf(g)
    owned.cooldown = 0
    step(g, STILL, TICK)
    expect(owned.sketch).toEqual({ move: SKETCH_COPY.fire, left: SKETCH.casts - 1 })
    expect(g.attacks.some((a) => a.move === 'sketch' && a.visual !== 'sketch')).toBe(true)
    // The painting runs out after its casts: the next one paints off whoever is nearest then.
    g.enemies = []
    spawnEnemy(g, 'geodude', p.x + 40, p.y)
    for (let i = 1; i < SKETCH.casts; i++) {
      owned.cooldown = 0
      step(g, STILL, TICK)
    }
    expect(owned.sketch?.move).toBe(SKETCH_COPY.fire)
    owned.cooldown = 0
    step(g, STILL, TICK)
    expect(owned.sketch?.move).toBe(SKETCH_COPY.rock)
  })

  it('takes a boss in reach over a nearer foe', () => {
    const g = smeargle()
    const p = g.player
    spawnEnemy(g, 'vulpix', p.x + 20, p.y)
    const boss = spawnWaveBoss(g, 'onix', g.time)
    Object.assign(boss, { x: p.x + 90, y: p.y })
    const owned = sketchOf(g)
    owned.cooldown = 0
    step(g, STILL, TICK)
    expect(owned.sketch?.move).toBe(SKETCH_BOSS.rock)
  })

  it('never evolves, and picks its Ability at Lv 12 instead', () => {
    const g = smeargle()
    g.player.level = 12
    advancePhase(g)
    expect(g.phase).toBe('ability')
    chooseOffer(g, g.player.offers[0]!)
    expect([g.phase, g.player.stage, g.player.ability.id !== null]).toEqual(['playing', 0, true])
  })

  it('paints the same moves for the same seed', () => {
    const painted = (seed: number) => {
      const g = smeargle(seed)
      const seen: string[] = []
      for (let i = 0; i < 60 * 25; i++) {
        if (g.phase !== 'playing' && g.player.offers.length > 0) chooseOffer(g, g.player.offers[0]!)
        else step(g, { move: { x: 1, y: 0 }, special: false }, TICK)
        const move = sketchOf(g).sketch?.move
        if (move && move !== seen[seen.length - 1]) seen.push(move)
      }
      return seen
    }
    const a = painted(3)
    expect(a.length).toBeGreaterThan(1)
    expect(painted(3)).toEqual(a)
  }, 60_000)
})
