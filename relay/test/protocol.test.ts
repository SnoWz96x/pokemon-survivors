import { describe, expect, it } from 'vitest'
import source from '../../src/net/protocol.ts?raw'
import { LIMITS, parseClientMessage } from '../../src/net/protocol'

describe('protocol', () => {
  it('imports nothing, so the relay never bundles game code', () => {
    expect(source).not.toMatch(/^\s*import[\s{*'"]/m)
    expect(source).not.toMatch(/^\s*export\s[^;=]*\sfrom\s*['"]/m)
    expect(source).not.toMatch(/\brequire\(|\bimport\(/)
  })

  it('refuses inputs posing as relay entries, and messages past their size', () => {
    expect(parseClientMessage('{"t":"in","k":"move","d":[3,1]}')).toEqual({ t: 'in', k: 'move', d: [3, 1] })
    expect(parseClientMessage('{"t":"in","k":"away","d":[]}')).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'in', k: 'move', d: ['x'.repeat(LIMITS.message)] }))).toBeNull()
    const chunk = JSON.stringify({ t: 'snap', tick: 600, h: 'ab', part: 0, parts: 1, data: 'A'.repeat(100_000) })
    expect(parseClientMessage(chunk)).toMatchObject({ t: 'snap', part: 0 })
    expect(parseClientMessage(JSON.stringify({ t: 'hash', tick: 61, h: 'ab' }))).toBeNull()
  })

  it('takes a batch of the messages a batch may carry, and nothing else', () => {
    const one = { t: 'in', k: 'move', d: [3, 1] }
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: [one, { t: 'ping', at: 5 }] }))).toEqual({ t: 'batch', m: [one, { t: 'ping', at: 5 }] })
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: [] }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: Array(LIMITS.batch + 1).fill(one) }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: [one, { t: 'in', k: 'away', d: [] }] }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: [{ t: 'batch', m: [one] }] }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ t: 'batch', m: [{ t: 'snap', tick: 600, h: 'ab', part: 0, parts: 1, data: 'AA==' }] }))).toBeNull()
  })
})
