import { describe, expect, it } from 'vitest'
import { banGated, groupReports, parseModeration, parseReport, REPORT, type OpenReport, type ReportedRun, type ReportTarget } from './reports'

const RUN = '0b0e6a4c-3f0e-4d43-9c55-6c1f3e2a9b10'

describe('parseReport', () => {
  it('cleans the handle, the run id and the note', () => {
    expect(parseReport({ target: ' @Ash_K ', run: RUN.toUpperCase(), reason: 'cheating', note: '  21 min\n de   Magikarp​ ' })).toEqual({
      target: 'ash_k',
      run: RUN,
      reason: 'cheating',
      note: '21 min de Magikarp',
    })
  })

  it('takes a missing run and an empty note as none', () => {
    expect(parseReport({ target: 'ash', reason: 'name', note: '   ' })).toEqual({ target: 'ash', run: null, reason: 'name', note: null })
  })

  it('refuses an unknown reason, a bad handle or run id, or a note too long', () => {
    expect(parseReport({ target: 'ash', reason: 'spam' })).toBeNull()
    expect(parseReport({ target: 'a', reason: 'other' })).toBeNull()
    expect(parseReport({ target: 'ash', run: 'not-a-run', reason: 'other' })).toBeNull()
    expect(parseReport({ target: 'ash', reason: 'other', note: 'x'.repeat(REPORT.note.max + 1) })).toBeNull()
    expect(parseReport({ target: 'ash', reason: 'other', note: 7 })).toBeNull()
    expect(parseReport('ash')).toBeNull()
  })
})

describe('banGated', () => {
  it('refuses the writes', () => {
    for (const [method, path] of [
      ['POST', '/runs'],
      ['PUT', `/runs/${RUN}`],
      ['PUT', `/runs/${RUN}/chunks/3`],
      ['PUT', '/save'],
      ['POST', '/reports'],
      ['POST', '/suggestions'],
      ['PUT', `/suggestions/${RUN}/vote`],
      ['PUT', '/poll'],
      ['POST', '/coop-invites'],
    ]) {
      expect(banGated(method!, path!), `${method} ${path}`).toBe(true)
    }
  })

  it('leaves reads and other routes open', () => {
    for (const [method, path] of [
      ['GET', '/save'],
      ['GET', '/boards/normal'],
      ['GET', '/gifts'],
      ['PUT', '/runs/'],
      ['PUT', `/runs/${RUN}/extra`],
      ['PUT', '/me'],
      ['DELETE', '/follows/ash'],
    ]) {
      expect(banGated(method!, path!), `${method} ${path}`).toBe(false)
    }
  })
})

describe('groupReports', () => {
  const ash: ReportTarget = { id: 'u1', handle: 'ash', name: 'Ash', banned: null }
  const gary: ReportTarget = { id: 'u2', handle: 'gary', name: 'Gary', banned: null }
  const run: ReportedRun = { id: RUN, starter: 'charmander', stage: 2, branch: null, difficulty: 'normal', time: 1800, kills: 4000, level: 60, outcome: 'victory', verified: null, at: '2026-10-20T10:00:00Z' }
  const report = (id: string, at: string, target: ReportTarget, extra: Partial<OpenReport> = {}): OpenReport => ({ id, reason: 'cheating', note: null, at, by: null, target, run: null, ...extra })

  it('groups by run, else by player, the most reported first', () => {
    const groups = groupReports([
      report('a', '2026-10-20T12:00:00Z', gary, { reason: 'name' }),
      report('b', '2026-10-20T13:00:00Z', ash, { run, note: 'impossível', by: 'misty' }),
      report('c', '2026-10-20T14:00:00Z', ash, { run, reason: 'other' }),
      report('d', '2026-10-20T15:00:00Z', ash, { reason: 'name' }),
    ])
    expect(groups.map((g) => [g.key, g.count])).toEqual([
      [`run:${RUN}`, 2],
      ['player:u2', 1],
      ['player:u1', 1],
    ])
    expect(groups[0]).toMatchObject({
      reasons: { cheating: 1, name: 0, other: 1 },
      notes: [{ text: 'impossível', by: 'misty', at: '2026-10-20T13:00:00Z' }],
      first: '2026-10-20T13:00:00Z',
      last: '2026-10-20T14:00:00Z',
    })
  })
})

describe('parseModeration', () => {
  it('reads each action', () => {
    expect(parseModeration({ action: 'remove', userId: 'u1', run: RUN })).toEqual({ action: 'remove', userId: 'u1', run: RUN })
    expect(parseModeration({ action: 'dismiss', userId: 'u1' })).toEqual({ action: 'dismiss', userId: 'u1', run: null })
    expect(parseModeration({ action: 'ban', userId: 'u1', reason: ' save  editado ' })).toEqual({ action: 'ban', userId: 'u1', reason: 'save editado' })
    expect(parseModeration({ action: 'reset', userId: 'u1' })).toEqual({ action: 'reset', userId: 'u1', reason: null })
  })

  it('refuses a ban without a reason, a removal without a run, or an unknown action', () => {
    expect(parseModeration({ action: 'ban', userId: 'u1', reason: '  ' })).toBeNull()
    expect(parseModeration({ action: 'remove', userId: 'u1' })).toBeNull()
    expect(parseModeration({ action: 'delete', userId: 'u1' })).toBeNull()
    expect(parseModeration({ action: 'unban' })).toBeNull()
  })
})
