import { playSfx } from '../engine/audio'
import type { Input } from '../engine/input'
import type { Team } from '../data/versus'
import { formAt } from '../game/branch'
import type { Game, Player } from '../game/types'
import { t } from '../i18n'
import { portraitUrl } from '../render/sprites'
import { teamColor } from './arena'
import { h, later } from './dom'
import { menu, type Screen } from './screens'
import { versusName } from './versusHud'

/**
 * A Versus match's end: Vitória, Derrota or Empate from this player's team,
 * the final score, and a table per team (each Pokémon, its KOs, falls,
 * points and damage, best scorer first). "Jogar de novo" starts the next
 * match (the shell's: a new one against bots, or the room's next run) and
 * says so while it gets ready; "Voltar ao lobby" leaves.
 */

export type VersusEndActions = { again: () => void; lobby: () => void }

/** Damage a player dealt in the match (the wild's and the rivals'). */
const damageOf = (p: Player) => Math.round(Object.values(p.damageByMove).reduce((a, b) => a + (b ?? 0), 0))

/** One team's table, best scorer first. */
const teamTable = (g: Game, me: Player, team: Team) => {
  const m = t().versus.end
  const rows = g.players
    .filter((p) => p.versus?.team === team)
    .sort((a, b) => (b.versus?.scored ?? 0) - (a.versus?.scored ?? 0) || (b.versus?.kos ?? 0) - (a.versus?.kos ?? 0))
    .map((p) => {
      const v = p.versus!
      return h(
        'tr',
        { class: p === me ? 'me' : '' },
        h('td', { class: 'vs-end-who' }, h('img', { src: portraitUrl(formAt(p.starter, p.branch, p.stage).dex), alt: '' }), h('span', {}, p === me && versusName(g, p.slot) !== t().versus.you ? `${versusName(g, p.slot)} (${t().versus.you})` : versusName(g, p.slot))),
        h('td', {}, String(v.kos)),
        h('td', {}, String(v.deaths)),
        h('td', { class: 'vs-end-points' }, String(v.scored)),
        h('td', {}, String(damageOf(p))),
      )
    })
  return h(
    'div',
    { class: `vs-end-team team${team}`, style: `--team:${teamColor(team)}` },
    h('div', { class: 'vs-end-team-head' }, h('b', {}, t().versus.teams[team]), h('span', {}, String(g.versus?.score[team] ?? 0))),
    h(
      'table',
      {},
      h('thead', {}, h('tr', {}, h('th', {}, m.pokemon), h('th', {}, m.kos), h('th', {}, m.deaths), h('th', {}, m.points), h('th', {}, m.damage))),
      h('tbody', {}, ...rows),
    ),
  )
}

export const versusEnd = (root: HTMLElement, input: Input, g: Game, me: Player, actions: VersusEndActions): Screen => {
  const m = t().versus.end
  const s = g.versus
  const mine = me.versus?.team ?? 0
  const winner = s?.result?.winner ?? null
  const outcome = winner === null ? 'draw' : winner === mine ? 'victory' : 'defeat'
  const status = h('p', { class: 'vs-end-status', role: 'status' })
  const again = h('button', { class: 'btn confirm', type: 'button' }, m.playAgain)
  const lobby = h('button', { class: 'btn', type: 'button' }, m.lobby)
  let asked = false
  const nav = menu(
    input,
    [again, lobby],
    (i) => {
      playSfx('select')
      if (i === 1) return later(actions.lobby)
      if (asked) return
      asked = true
      again.disabled = true
      status.textContent = m.again
      later(actions.again)
    },
    { horizontal: true, guard: 900 },
  )
  // Your team's table first.
  const teams = mine === 0 ? ([0, 1] as const) : ([1, 0] as const)
  const el = h(
    'div',
    { class: 'screen dim vs-end' },
    h(
      'div',
      { class: `dialog box pop vs-end-box ${outcome}`, style: `--team:${teamColor(mine)}` },
      h('div', { class: 'vs-end-title' }, m[outcome]),
      h(
        'div',
        { class: 'vs-end-score' },
        h('b', { style: `color:${teamColor(0)}` }, String(s?.score[0] ?? 0)),
        h('span', {}, ':'),
        h('b', { style: `color:${teamColor(1)}` }, String(s?.score[1] ?? 0)),
      ),
      h('div', { class: 'vs-end-tables' }, ...teams.map((team) => teamTable(g, me, team))),
      status,
      h('div', { class: 'buttons' }, again, lobby),
    ),
  )
  root.append(el)
  return { el, dim: 0.6, dispose: () => (nav.off(), el.remove()) }
}
