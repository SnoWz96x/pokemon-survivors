import { describe, expect, it } from 'vitest'
import type { ClientMessage, Entry } from '../net/protocol'
import { ack, createOutbox, due, onReconnect, onSlow, OUTBOX, push, queued } from './outbox'

const inputs = (msgs: ClientMessage[]) => msgs.flatMap((m) => (m.t === 'in' ? [[m.k, ...m.d]] : []))

describe('the outbox', () => {
  it('coalesces the stick to its latest value, at most 30 a second (15 after a slow)', () => {
    const o = createOutbox()
    push(o, { k: 'move', code: 3, sample: 1 }, 0)
    push(o, { k: 'move', code: 9, sample: 2 }, 0)
    expect(inputs(due(o, 0, 100))).toEqual([['move', 9, 2]])
    push(o, { k: 'move', code: 4, sample: 3 }, 10)
    expect(due(o, 10, 100)).toEqual([])
    expect(inputs(due(o, 1000 / OUTBOX.moveHz, 100))).toEqual([['move', 4, 3]])
    onSlow(o, 100)
    push(o, { k: 'move', code: 5, sample: 4 }, 100)
    expect(inputs(due(o, 110, 100))).toHaveLength(1)
    push(o, { k: 'move', code: 6, sample: 5 }, 120)
    expect(due(o, 110 + 1000 / OUTBOX.moveHz, 100)).toEqual([])
    expect(inputs(due(o, 111 + 2000 / OUTBOX.moveHz, 100))).toHaveLength(1)
  })

  it('sends a pick again until it comes back stamped, with the same nonce', () => {
    const o = createOutbox()
    const nonce = push(o, { k: 'pick', screen: 'levelup', round: 4, index: 1 }, 0)
    expect(inputs(due(o, 0, 50))).toEqual([['pick', 'levelup', 4, 1, nonce]])
    expect(due(o, 100, 50)).toEqual([])
    // Not seen back in time (lost in a relay restart): again.
    expect(inputs(due(o, OUTBOX.resendMs, 50))).toEqual([['pick', 'levelup', 4, 1, nonce]])
    // A teammate's entry, or another kind with the same nonce, doesn't count.
    ack(o, 0, [1, 'pick', 'levelup', 4, 1, nonce])
    ack(o, 0, [0, 'reroll', 4, nonce])
    expect(queued(o)).toBe(1)
    const stamped: Entry = [0, 'pick', 'levelup', 4, 1, nonce]
    ack(o, 0, stamped)
    expect(queued(o)).toBe(0)
    expect(due(o, 10_000, 50)).toEqual([])
    expect(o.stats).toMatchObject({ reliableSent: 2, resent: 1, acked: 1 })
  })

  it('waits longer on a slow link before resending', () => {
    const o = createOutbox()
    push(o, { k: 'skip', round: 2 }, 0)
    due(o, 0, 300)
    expect(due(o, 899, 300)).toEqual([])
    expect(inputs(due(o, 900, 300))).toHaveLength(1)
  })

  it('after a reconnect drops the stale stick and presses, and resends every pick at once', () => {
    const o = createOutbox()
    push(o, { k: 'pick', screen: 'tm', round: 1, index: 0 }, 0)
    due(o, 0, 50)
    push(o, { k: 'move', code: 7, sample: 9 }, 5)
    push(o, { k: 'special', sample: 9 }, 5)
    onReconnect(o)
    expect(inputs(due(o, 6, 50))).toEqual([['pick', 'tm', 1, 0, 1]])
  })

  it('stays bounded under a pick storm and never floods', () => {
    const o = createOutbox()
    for (let i = 0; i < 500; i++) push(o, { k: 'pick', screen: 'levelup', round: i, index: 0 }, i)
    expect(queued(o)).toBe(OUTBOX.reliable)
    expect(inputs(due(o, 500, 50))).toHaveLength(OUTBOX.burst)
    // Presses wait once each.
    push(o, { k: 'special', sample: 1 }, 501)
    push(o, { k: 'special', sample: 1 }, 501)
    expect(inputs(due(o, 501, 50)).filter((m) => m[0] === 'special')).toHaveLength(1)
    // Given up on long after its screen's timer picked.
    expect(queued(createOutbox())).toBe(0)
    due(o, 500 + OUTBOX.giveUpMs + 500, 50)
    expect(queued(o)).toBe(0)
  })
})
