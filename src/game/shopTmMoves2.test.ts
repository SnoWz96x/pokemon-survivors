import { describe, expect, it } from 'vitest'
import { hurtPlayer } from './combat'
import { spawnEnemy } from './enemies'
import { chooseOffer, step } from './game'
import { NO_RANKS } from './meta'
import { moveStats, withBranch } from './moves'
import { startGame, TICK, type ReplayStart } from './replay'
import { danceStacks, punchDrain, RAIN_DANCE, SWORDS_DANCE, waveParalysis, WEATHER_CALL } from './shopTmMoves2'
import { STATUS_RULES } from './status'
import { BASE_STATS } from './stats'
import type { Game, OwnedMove } from './types'
import { calledWeather, releasedWeather, updateWeather, type WeatherState } from './weather'

const START: ReplayStart = { seed: 5, starter: 'squirtle', difficulty: 'normal', ranks: NO_RANKS, shiny: false, luckyEgg: false, outbreak: null, halloween: false, bag: [], view: { w: 480, h: 270 } }

/** A run past its first pick, holding only `move` (ready to cast) at `level`, its forks on `path`. */
const run = (move: OwnedMove['id'], level = 1, path = 0): Game => {
  const g = startGame(START)
  chooseOffer(g, g.player.offers[0]!)
  g.player.moves = [{ id: move, level, cooldown: 0, path }]
  return g
}

const tick = (g: Game, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / TICK); i++) step(g, { move: { x: 0, y: 0 }, special: false }, TICK)
}

const SAND: WeatherState = { id: 'sand', prev: 'clear', since: 10, next: 70, chip: 0, held: null }

describe('a called sky (Rain Dance, Sunny Day)', () => {
  it('holds the scheduled weather with the time it had left, and gives it back when the call ends', () => {
    const rain = calledWeather(SAND, 'rain', 40, 40)!
    expect(rain).toMatchObject({ id: 'rain', prev: 'sand', since: 40, next: 80, held: { id: 'sand', left: 30 } })
    expect(releasedWeather(rain, 80, () => true)).toMatchObject({ id: 'sand', prev: 'rain', since: 80, next: 110, held: null })
    // A biome that no longer has it rolls a new spell instead.
    expect(releasedWeather(rain, 80, (id) => id !== 'sand')).toBeNull()
  })

  it('extends on a second call, keeps the first interruption under another move, and never beats an omen', () => {
    const rain = calledWeather(SAND, 'rain', 40, 40)!
    expect(calledWeather(rain, 'rain', 40, 60)).toMatchObject({ id: 'rain', since: 40, next: 100, held: { id: 'sand', left: 30 } })
    expect(calledWeather(rain, 'sun', 40, 60)).toMatchObject({ id: 'sun', prev: 'rain', next: 100, held: { id: 'sand', left: 30 } })
    expect(calledWeather({ ...SAND, next: Infinity }, 'rain', 40, 40)).toBeNull()
    // Calling the weather that was already falling: the schedule rolls a new one after.
    const same = calledWeather({ ...SAND, id: 'rain' }, 'rain', 40, 40)!
    expect(releasedWeather(same, 80, () => true)).toBeNull()
  })

  it('Rain Dance brings the rain, drops on the foes around, and the run’s weather comes back after', () => {
    const g = run('rainDance')
    // The run starts in the meadow, where the sun shines but no sandstorm blows.
    g.weather = { ...SAND, id: 'sun', since: g.time - 5, next: g.time + 30 }
    for (let i = 0; i < 6; i++) spawnEnemy(g, 'rattata', g.player.x + 40 + i * 8, g.player.y)
    tick(g, WEATHER_CALL.every + WEATHER_CALL.fall + 0.1)
    expect(g.weather.id).toBe('rain')
    expect(g.events.some((e) => e.kind === 'weather' && e.weather === 'rain')).toBe(true)
    expect(g.attacks.filter((a) => a.visual === 'rainDrop').length).toBeGreaterThan(0)
    g.time = g.weather.next
    updateWeather(g, TICK)
    expect(g.weather).toMatchObject({ id: 'sun', held: null })
  }, 30_000)

  it('Soothing Rain heals while its rain falls on the player', () => {
    const g = run('rainDance', 4, withBranch(0, 4, 1))
    g.player.hp = g.player.stats.maxHp / 2
    tick(g, 1)
    expect(g.weather.id).toBe('rain')
    expect(g.player.hp).toBeCloseTo(g.player.stats.maxHp * (0.5 + RAIN_DANCE.heal * (1 - TICK)), 0)
  }, 30_000)
})

describe('Swords Dance', () => {
  it('stacks a dance while the last one holds, up to the cap, and starts over once it lapses', () => {
    expect(danceStacks(0, false, 3)).toBe(1)
    expect(danceStacks(2, true, 3)).toBe(3)
    expect(danceStacks(3, true, 3)).toBe(3)
    expect(danceStacks(3, false, 3)).toBe(1)
  })

  it('raises might by a stack per dance', () => {
    const g = run('swordsDance', 3)
    const might = g.player.stats.might
    const s = moveStats('swordsDance', 3, BASE_STATS)
    expect(s.duration).toBeGreaterThan(s.cooldown)
    tick(g, 2 * s.cooldown + 0.2)
    expect(g.player.moves[0]!.stacks).toBe(3)
    expect(g.player.stats.might).toBeCloseTo(might + 3 * SWORDS_DANCE.might)
  }, 30_000)
})

describe('Drain Punch', () => {
  it('heals a share of its damage that its Leech branch raises', () => {
    expect(punchDrain(moveStats('drainPunch', 1, BASE_STATS))).toBeCloseTo(0.35)
    expect(punchDrain(moveStats('drainPunch', 4, BASE_STATS, withBranch(0, 4, 1)))).toBeCloseTo(0.55)
    const g = run('drainPunch')
    g.player.hp = g.player.stats.maxHp / 2
    spawnEnemy(g, 'snorlax', g.player.x + 20, g.player.y)
    tick(g, 0.2)
    expect(g.player.hp).toBeGreaterThan(g.player.stats.maxHp / 2)
  }, 30_000)
})

describe('Thunder Wave', () => {
  it('paralyzes for the cast’s duration, bosses for their share of it', () => {
    const s = moveStats('thunderWave', 4, BASE_STATS, withBranch(0, 4, 1))
    expect(waveParalysis(s)).toMatchObject({ kind: 'paralysis', chance: 1, duration: 3.5 })
    const g = run('thunderWave')
    const foe = spawnEnemy(g, 'rattata', g.player.x + 40, g.player.y)
    const boss = spawnEnemy(g, 'onix', g.player.x, g.player.y + 60)
    tick(g, 0.3)
    expect(foe.status.paralysis.time).toBeGreaterThan(1.5)
    g.player.moves[0]!.cooldown = 0
    g.player.facing = { x: 0, y: 1 }
    foe.x = g.player.x + 400
    tick(g, 0.4)
    expect(boss.status.paralysis.time).toBeLessThanOrEqual(2 * STATUS_RULES.paralysis.boss)
    expect(boss.status.paralysis.time).toBeGreaterThan(0)
  }, 30_000)
})

describe('Fly', () => {
  it('takes the player out of reach, then slams down where they land', () => {
    const g = run('fly')
    tick(g, TICK)
    expect(g.player.hidden?.move).toBe('fly')
    const hp = g.player.hp
    hurtPlayer(g, 20)
    expect(g.player.hp).toBe(hp)
    const foe = spawnEnemy(g, 'rattata', g.player.x + 10, g.player.y)
    const foeHp = foe.hp
    tick(g, 1)
    expect(g.player.hidden).toBeNull()
    expect(g.attacks.some((a) => a.visual === 'flySlam')).toBe(true)
    expect(foe.hp < foeHp || foe.dying >= 0).toBe(true)
  }, 30_000)
})
