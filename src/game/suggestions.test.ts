import { describe, expect, it } from 'vitest'
import { boardColumns, nextVote, parseSuggestion, parseSuggestionDraft, SUGGESTION, withVote, type Suggestion } from './suggestions'

describe('parseSuggestionDraft', () => {
  it('puts the title on one line and keeps at most one blank line in the body', () => {
    expect(parseSuggestionDraft({ title: '  Modo\n co-op   online ', body: 'Jogar com\r\n\r\n\r\n\r\num  amigo  \n' })).toEqual({
      title: 'Modo co-op online',
      body: 'Jogar com\n\num amigo',
    })
  })

  it('drops control and invisible characters', () => {
    const zeroWidth = String.fromCodePoint(0x200b)
    const rtl = String.fromCodePoint(0x202e)
    expect(parseSuggestionDraft({ title: `Mais${zeroWidth} ${rtl}bosses\u0007`, body: '' })).toEqual({ title: 'Mais bosses', body: '' })
  })

  it('takes a missing body as empty', () => {
    expect(parseSuggestionDraft({ title: 'Mais bosses' })).toEqual({ title: 'Mais bosses', body: '' })
  })

  it('refuses a title too short or too long (in characters), a body too long, or anything else', () => {
    expect(parseSuggestionDraft({ title: '  oi    ', body: '' })).toBeNull()
    expect(parseSuggestionDraft({ title: '🐉'.repeat(SUGGESTION.title.max), body: '' })).not.toBeNull()
    expect(parseSuggestionDraft({ title: 'x'.repeat(SUGGESTION.title.max + 1), body: '' })).toBeNull()
    expect(parseSuggestionDraft({ title: 'Mais bosses', body: 'x'.repeat(SUGGESTION.body.max + 1) })).toBeNull()
    expect(parseSuggestionDraft({ title: 'Mais bosses', body: 3 })).toBeNull()
    expect(parseSuggestionDraft('Mais bosses')).toBeNull()
  })
})

describe('votes', () => {
  it('takes a vote back when the same arrow is pressed again', () => {
    expect(nextVote(0, 1)).toBe(1)
    expect(nextVote(1, 1)).toBe(0)
    expect(nextVote(1, -1)).toBe(-1)
    expect(nextVote(-1, -1)).toBe(0)
  })

  it('moves the score by the change of vote', () => {
    const idea: Suggestion = { id: 'a', title: 'Mais bosses', body: '', handle: 'ash', name: 'Ash', status: 'open', score: 5, at: '', doneAt: null, vote: 1, mine: false }
    expect(withVote(idea, -1)).toMatchObject({ vote: -1, score: 3 })
    expect(withVote(idea, 0)).toMatchObject({ vote: 0, score: 4 })
    expect(withVote({ ...idea, vote: 0 }, 1)).toMatchObject({ vote: 1, score: 6 })
  })
})

describe('the board', () => {
  const idea = (id: string, status: Suggestion['status']): Suggestion => ({ id, title: id, body: '', handle: 'ash', name: 'Ash', status, score: 1, at: '', doneAt: null, vote: 0, mine: false })

  it('puts each idea in its column, the asker’s ideas under review first in the Backlog', () => {
    const columns = boardColumns([idea('a', 'open'), idea('b', 'cooking'), idea('c', 'pending'), idea('d', 'open'), idea('e', 'done')])
    expect(columns.open.map((s) => s.id)).toEqual(['c', 'a', 'd'])
    expect(columns.todo).toEqual([])
    expect(columns.cooking.map((s) => s.id)).toEqual(['b'])
    expect(columns.done.map((s) => s.id)).toEqual(['e'])
  })

  it('reads every status but hidden from the API', () => {
    expect(parseSuggestion({ ...idea('a', 'todo') })?.status).toBe('todo')
    expect(parseSuggestion({ ...idea('a', 'open'), status: 'hidden' })).toBeNull()
  })
})
