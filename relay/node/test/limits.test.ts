import { describe, expect, it } from 'vitest'
import { clientIp, createLimiter } from '../src/limits'

describe('rate limits', () => {
  it('allows `limit` hits per key in each window', () => {
    const l = createLimiter(2, 1000)
    expect([l.hit('a', 0), l.hit('a', 10), l.hit('a', 20), l.hit('b', 20)]).toEqual([true, true, false, true])
    expect(l.hit('a', 1000)).toBe(true)
  })

  it("reads the player's address from the proxy's header only when told to", () => {
    expect(clientIp({ 'x-real-ip': '203.0.113.9' }, '10.0.1.5', 'x-real-ip')).toBe('203.0.113.9')
    expect(clientIp({ 'x-real-ip': '203.0.113.9' }, '10.0.1.5', null)).toBe('10.0.1.5')
    expect(clientIp({}, '10.0.1.5', 'x-real-ip')).toBe('10.0.1.5')
  })
})
