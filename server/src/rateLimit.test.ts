import { describe, expect, it } from 'vitest'
import { rateLimiter } from './rateLimit'

describe('rateLimiter', () => {
  it('lets `limit` hits per key through in a window, then again once it slides', () => {
    const limiter = rateLimiter(2, 1000)
    expect(limiter.take(['ip:a'], 0)).toBe(true)
    expect(limiter.take(['ip:a'], 500)).toBe(true)
    expect(limiter.take(['ip:a'], 900)).toBe(false)
    expect(limiter.take(['ip:b'], 900)).toBe(true)
    expect(limiter.take(['ip:a'], 1000)).toBe(true)
  })

  it('counts a hit on every key or none: a full account blocks a fresh IP, and that try costs the IP nothing', () => {
    const limiter = rateLimiter(1, 1000)
    expect(limiter.take(['ip:a', 'user:1'], 0)).toBe(true)
    expect(limiter.take(['ip:b', 'user:1'], 10)).toBe(false)
    expect(limiter.take(['ip:b'], 20)).toBe(true)
  })
})
