import { describe, expect, it } from 'vitest'
import { parseQueueMessage, queueUrl } from './queue'

describe('queueUrl', () => {
  it("is the relay's origin over WebSocket, with the token", () => {
    expect(queueUrl('https://relay.example/', 'a b')).toBe('wss://relay.example/arena/queue?token=a%20b')
    expect(queueUrl('http://localhost:8787', null)).toBe('ws://localhost:8787/arena/queue')
  })
})

describe('parseQueueMessage', () => {
  it('reads the three messages and refuses the rest', () => {
    expect(parseQueueMessage('{"t":"queued","kind":"ranked","waited":12,"found":3,"botsIn":78}')).toEqual({ t: 'queued', kind: 'ranked', waited: 12, found: 3, botsIn: 78 })
    expect(parseQueueMessage('{"t":"matched","room":"K7QF2","team":1,"ranked":false,"humans":1}')).toEqual({ t: 'matched', room: 'K7QF2', team: 1, ranked: false, humans: 1 })
    expect(parseQueueMessage('{"t":"refused","why":"auth"}')).toEqual({ t: 'refused', why: 'auth' })
    expect(parseQueueMessage('{"t":"refused","why":"nope"}')).toBeNull()
    expect(parseQueueMessage('{"t":"matched","room":"K7QF2","team":2,"ranked":true,"humans":2}')).toBeNull()
    expect(parseQueueMessage('not json')).toBeNull()
  })
})
