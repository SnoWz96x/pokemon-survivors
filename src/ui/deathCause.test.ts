import { describe, expect, it } from 'vitest'
import { harmBy, NO_ONE, WORLD_HARM, type Harm, type HarmBy } from '../game/harm'
import type { HitKind } from '../data/abilities'
import { en } from '../i18n/en'
import { pt } from '../i18n/pt'
import { harmLabel } from './deathCause'

const hit = (by: HarmBy, kind: HitKind): Harm => ({ ...by, hit: kind, dmg: 100 })

describe('harmLabel', () => {
  it("names a boss's ultimate with the boss", () => {
    const judgment = hit(harmBy('arceus', 'Judgment'), 'hazard')
    expect(harmLabel(judgment, en.results.cause)).toBe("Arceus's Judgment")
    expect(harmLabel(judgment, pt.results.cause)).toBe('Judgment de Arceus')
  })

  it('names an Alpha and the kind of hit when the attack has no name', () => {
    expect(harmLabel(hit({ ...harmBy('gengar'), alpha: true }, 'body'), en.results.cause)).toBe('Alpha Gengar (contact)')
    expect(harmLabel(hit(harmBy('gengar'), 'shot'), pt.results.cause)).toBe('Gengar (projétil)')
  })

  it("says the world's attacks and the nameless ones by their kind", () => {
    expect(harmLabel(hit(WORLD_HARM, 'zone'), en.results.cause)).toBe('World attack (zone)')
    expect(harmLabel(hit(NO_ONE, 'lava'), pt.results.cause)).toBe('Lava')
    expect(harmLabel(hit(NO_ONE, 'trap'), en.results.cause)).toBe('Trap')
  })
})
