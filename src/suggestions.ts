import { accountState } from './account'
import { apiCall } from './api'
import { isRecord } from './game/parse'
import { isVote, parseSuggestion, parseSuggestions, type Suggestion, type SuggestionDraft, type SuggestionSort, type SuggestionStatus, type Vote } from './game/suggestions'

/**
 * The idea board's side of the API (`server/`). Reading is open to guests;
 * posting and voting need an account. Like `supporters.ts`, every call fails
 * soft, so the screen just says the board is out of reach.
 */

/** The board (`'board'`, every column) or an earlier build's tab, with the player's votes when signed in; null when the API can't be reached. */
export const fetchSuggestions = async (sort: SuggestionSort): Promise<Suggestion[] | null> => {
  const { status, body } = await apiCall(`/suggestions?sort=${sort}`, { auth: accountState().kind === 'signedIn' })
  return status === 200 && isRecord(body) ? parseSuggestions(body.suggestions) : null
}

/** What posting an idea came to: the idea, or why not (`profile`: no handle yet, `limit`: `SUGGESTION.perDay` reached, `banned`: the account can't post). */
export type Posted = { ok: true; suggestion: Suggestion } | { ok: false; reason: 'profile' | 'limit' | 'banned' | 'invalid' | 'offline' }

/** Posts an idea (already cleaned by `parseSuggestionDraft`). */
export const postSuggestion = async (draft: SuggestionDraft): Promise<Posted> => {
  const { status, body } = await apiCall('/suggestions', { method: 'POST', body: draft, auth: true })
  const suggestion = status === 201 && isRecord(body) ? parseSuggestion(body.suggestion) : null
  if (suggestion) return { ok: true, suggestion }
  if (status === 403) return { ok: false, reason: isRecord(body) && body.error === 'banned' ? 'banned' : 'profile' }
  if (status === 429) return { ok: false, reason: 'limit' }
  if (status === 400) return { ok: false, reason: 'invalid' }
  return { ok: false, reason: 'offline' }
}

/** The player's vote on an idea (0 takes it back): its score after it, `closed` once it shipped (or left the board), null offline. */
export const voteSuggestion = async (id: string, vote: Vote): Promise<{ score: number; vote: Vote } | 'closed' | null> => {
  const { status, body } = await apiCall(`/suggestions/${id}/vote`, { method: 'PUT', body: { vote }, auth: true })
  if (status === 404 || status === 409) return 'closed'
  return status === 200 && isRecord(body) && typeof body.score === 'number' && isVote(body.vote) ? { score: body.score, vote: body.vote } : null
}

/** The admin moves an idea to a column (`open` is the Backlog, `done` shipped) or `hidden`. Whether it went through (the API checks who's asking). */
export const setSuggestionStatus = async (id: string, status: SuggestionStatus) =>
  (await apiCall(`/admin/suggestions/${id}`, { method: 'PUT', body: { status }, auth: true })).status === 200
