import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RULES_VERSION } from '../../src/game/replay'
import { FROZEN_RULES, FROZEN_URL, isSim } from './sims'

/**
 * The guard for a missed `npm run rules:freeze`: the API must ship the
 * simulator of the rules right before its own, and only that one, or a bump
 * would refuse every run that straddles its deploy again.
 */
describe('the frozen simulator', () => {
  const FIX = `RULES_VERSION is ${RULES_VERSION}: run \`npm run rules:freeze\` to bundle the rules ${RULES_VERSION - 1} simulator into server/sims`

  it('is the previous rules, alone in server/sims', () => {
    const shipped = readdirSync(new URL('.', FROZEN_URL)).filter((f) => f.endsWith('.mjs'))
    expect(shipped, FIX).toEqual([`rules-${RULES_VERSION - 1}.mjs`])
  })

  it('plays by the rules its name says', async () => {
    const mod: unknown = await import(FROZEN_URL.href)
    expect(isSim(mod, FROZEN_RULES), FIX).toBe(true)
  })
})
