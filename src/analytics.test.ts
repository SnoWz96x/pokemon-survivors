import { describe, expect, it } from 'vitest'
import { flagIn, isOwnError } from './analytics'

const origin = 'https://www.pokemonsurvivors.com'
const errorWithStack = (stack: string) => Object.assign(new Error('x'), { stack })

describe('isOwnError', () => {
  it("keeps errors from the game's scripts", () => {
    expect(isOwnError(new Error('x'), `${origin}/assets/main-DHVVhsKK.js`, origin)).toBe(true)
    expect(isOwnError(new Error('x'), 'http://localhost:5183/src/main.ts?t=1', 'http://localhost:5183')).toBe(true)
  })

  it('drops errors a browser injects into the page (WebKit names the page as their file)', () => {
    expect(isOwnError(new RangeError('Maximum call stack size exceeded.'), `${origin}/`, origin)).toBe(false)
    expect(isOwnError(new Error('La'), `${origin}/en/?ref=sdog`, origin)).toBe(false)
  })

  it('drops errors from other origins and extensions', () => {
    expect(isOwnError(new Error('x'), 'https://metrics.pedrobarretto.com.br/script.js', origin)).toBe(false)
    expect(isOwnError(new Error('x'), 'safari-web-extension://abc/content.js', origin)).toBe(false)
  })

  it("reads a rejection's source from the top of its stack", () => {
    expect(isOwnError(errorWithStack(`Hk@${origin}/:229:383\nFk@${origin}/:229:63`), undefined, origin)).toBe(false)
    expect(isOwnError(errorWithStack(`TypeError: x\n    at lG (${origin}/assets/main-a.js:27:1035830)`), undefined, origin)).toBe(true)
  })

  it('keeps what it cannot place', () => {
    expect(isOwnError('boom', undefined, origin)).toBe(true)
    expect(isOwnError(errorWithStack('no urls here'), '', origin)).toBe(true)
  })
})


describe('flagIn', () => {
  it("reads a flag from /flags/?v=2's answer", () => {
    expect(flagIn({ flags: { 'coop-beta': { key: 'coop-beta', enabled: true, variant: null } } }, 'coop-beta')).toBe(true)
    expect(flagIn({ flags: { 'coop-beta': { key: 'coop-beta', enabled: false } } }, 'coop-beta')).toBe(false)
  })

  it('falls back to the older featureFlags map', () => {
    expect(flagIn({ featureFlags: { 'coop-beta': true } }, 'coop-beta')).toBe(true)
    expect(flagIn({ featureFlags: { 'coop-beta': 'test' } }, 'coop-beta')).toBe(true)
  })

  it("can't tell about a flag it wasn't given (unknown key, an error body)", () => {
    expect(flagIn({ flags: {} }, 'coop-beta')).toBeNull()
    expect(flagIn({ type: 'authentication_error' }, 'coop-beta')).toBeNull()
    expect(flagIn(null, 'coop-beta')).toBeNull()
  })
})
