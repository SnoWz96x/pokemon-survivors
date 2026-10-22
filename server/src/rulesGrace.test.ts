import { describe, expect, it } from 'vitest'
import { RULES_GRACE_SECONDS, rulesVerdict } from './rulesGrace'

describe('rulesVerdict', () => {
  const N = 34
  const hour = 3600

  it('takes the current rules on any token, pinned or not', () => {
    expect(rulesVerdict(N, { rules: N, age: 10 }, N)).toBe('same')
    // A token the previous API dealt to a tab that had already reloaded into the new build.
    expect(rulesVerdict(N, { rules: N - 1, age: 10 }, N)).toBe('same')
    expect(rulesVerdict(N, null, N)).toBe('same')
  })

  it('takes the previous rules only on a token pinned to them, within the window', () => {
    expect(rulesVerdict(N - 1, { rules: N - 1, age: hour }, N)).toBe('grace')
    expect(rulesVerdict(N - 1, { rules: N - 1, age: RULES_GRACE_SECONDS }, N)).toBe('grace')
    expect(rulesVerdict(N - 1, { rules: N - 1, age: RULES_GRACE_SECONDS + 1 }, N)).toBe('outdated')
  })

  it('refuses old rules claimed on a token dealt under the current ones, or with no pin', () => {
    expect(rulesVerdict(N - 1, { rules: N, age: 10 }, N)).toBe('outdated')
    expect(rulesVerdict(N - 1, { rules: null, age: 10 }, N)).toBe('outdated')
    expect(rulesVerdict(N - 1, null, N)).toBe('outdated')
  })

  it('refuses rules older than the previous ones, even pinned', () => {
    expect(rulesVerdict(N - 2, { rules: N - 2, age: 10 }, N)).toBe('outdated')
  })

  it('waits for the API on newer rules', () => {
    expect(rulesVerdict(N + 1, { rules: N, age: 10 }, N)).toBe('behind')
  })
})
