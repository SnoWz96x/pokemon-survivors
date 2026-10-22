import { describe, expect, it } from 'vitest'
import { clientIp, createLimiter } from '../src/limits'

describe('rate limits', () => {
  it('allows `limit` hits per key in each window', () => {
    const l = createLimiter(2, 1000)
    expect([l.hit('a', 0), l.hit('a', 10), l.hit('a', 20), l.hit('b', 20)]).toEqual([true, true, false, true])
    expect(l.hit('a', 1000)).toBe(true)
  })

  it('reads the player behind CloudFront only when told to trust it', () => {
    expect(clientIp('203.0.113.9:51234', '10.0.0.5', true)).toBe('203.0.113.9')
    expect(clientIp('2001:db8::7:51234', '10.0.0.5', true)).toBe('2001:db8::7')
    expect(clientIp('203.0.113.9:51234', '10.0.0.5', false)).toBe('10.0.0.5')
  })
})
