import { describe, expect, it } from 'vitest'
import { mergeShinyStarters, parseShinyStarters, unlockShinyStarter } from './shinyStarters'

describe('shiny starters', () => {
  it('unlock picked shiny, and a second roll keeps the pick', () => {
    expect(unlockShinyStarter({}, 'charmander')).toEqual({ charmander: true })
    expect(unlockShinyStarter({ charmander: false }, 'charmander')).toEqual({ charmander: false })
  })

  it('merge as a union, with the incoming pick', () => {
    expect(mergeShinyStarters({ charmander: true, pichu: true }, { charmander: false, gible: true })).toEqual({ charmander: false, pichu: true, gible: true })
  })

  it('parse only known Pokémon with a boolean pick', () => {
    expect(parseShinyStarters({ charmander: true, missingno: true, pichu: 'yes', gible: false })).toEqual({ charmander: true, gible: false })
    expect(parseShinyStarters(null)).toEqual({})
  })
})
