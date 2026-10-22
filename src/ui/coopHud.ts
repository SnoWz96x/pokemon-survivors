import type { Connection } from '../coop/client'
import { coopStats } from '../game/coop'
import { PLAYABLE } from '../data/hatchlings'
import type { Game } from '../game/types'
import type { Input } from '../engine/input'
import { formatPokeDollars, t } from '../i18n'
import { h, setText } from './dom'
import { menu, type Screen } from './screens'

/**
 * The co-op run's own bits of HUD: the connection pip (ping and quality),
 * the reconnecting veil (only after a second of silence), the syncing bar
 * (only far behind), the "waiting for the team" line while a teammate picks,
 * and a basic end screen (PR 7 brings the full one). Minimal on purpose.
 */

export type CoopHud = {
  update: (c: Connection, waiting: number | null, joining: boolean) => void
  dispose: () => void
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export const createCoopHud = (root: HTMLElement): CoopHud => {
  const ms = h('span')
  const pip = h('div', { class: 'coop-pip good', 'aria-live': 'off' }, h('i'), ms)
  const veilText = h('b')
  const veilHint = h('small')
  const bar = h('div', { class: 'coop-bar-fill' })
  const progress = h('div', { class: 'coop-bar hidden' }, bar)
  const veil = h('div', { class: 'coop-veil hidden' }, h('div', { class: 'coop-veil-box box' }, veilText, progress, veilHint))
  const waiting = h('div', { class: 'coop-waiting box hidden' })
  const el = h('div', { class: 'coop-hud' }, pip, waiting, veil)
  root.append(el)
  let quality = ''
  return {
    update: (c, wait, joining) => {
      const q = c.quality
      if (q !== quality) {
        pip.className = `coop-pip ${q}`
        quality = q
      }
      setText(ms, c.rtt > 0 ? t().coop.ping(c.rtt) : '…')
      const m = t().coop
      const syncing = c.syncing !== null
      const show = joining || c.stalled || syncing
      veil.classList.toggle('hidden', !show)
      if (show) {
        setText(veilText, c.stalled ? m.reconnecting : joining ? m.joining : m.syncing)
        setText(veilHint, c.stalled ? m.reconnectingHint : '')
        progress.classList.toggle('hidden', c.stalled || c.syncing === null)
        bar.style.width = `${Math.round((c.syncing ?? 0) * 100)}%`
      }
      waiting.classList.toggle('hidden', wait === null)
      if (wait !== null) setText(waiting, m.waiting(Math.ceil(wait)))
    },
    dispose: () => el.remove(),
  }
}

/**
 * The end of a co-op run: the team's lines (time, kills, damage, revives),
 * this player's share of the ₽, and at a victory the endless vote. Basic: PR
 * 7 brings the real end screen on `coopStats`.
 */
export const coopEnd = (
  root: HTMLElement,
  input: Input,
  g: Game,
  slot: number,
  share: number,
  actions: { vote: ((endless: boolean) => void) | null; back: () => void },
): Screen => {
  const m = t().coop.end
  const stats = coopStats(g)
  const names = g.coop?.names ?? []
  const rows = stats.players.map((p) =>
    h(
      'tr',
      { class: p.slot === slot ? 'me' : '' },
      h('td', {}, names[p.slot] || PLAYABLE[p.starter].name),
      h('td', {}, String(p.kills)),
      h('td', {}, String(p.damage)),
      h('td', {}, String(p.revives)),
    ),
  )
  const voted = h('p', { class: 'coop-voted hidden' }, m.voted)
  const buttons = actions.vote
    ? [h('button', { class: 'btn' }, m.endless), h('button', { class: 'btn' }, m.stop)]
    : [h('button', { class: 'btn' }, m.back)]
  const el = h(
    'div',
    { class: 'screen dim coop-end' },
    h(
      'div',
      { class: 'box panel' },
      h('h2', {}, g.phase === 'victory' ? m.victory : m.over),
      h('p', {}, `${m.time} ${fmtTime(stats.time)} · ${m.kills} ${stats.total.kills}`),
      h('table', { class: 'coop-table' }, h('tr', {}, h('th', {}, ''), h('th', {}, m.kills), h('th', {}, m.damage), h('th', {}, m.revives)), ...rows),
      h('p', {}, m.coins(formatPokeDollars(share))),
      voted,
      h('div', { class: 'buttons' }, ...buttons),
    ),
  )
  root.append(el)
  const nav = menu(input, buttons, (i) => {
    if (!actions.vote) return actions.back()
    actions.vote(i === 0)
    voted.classList.remove('hidden')
  })
  return { el, dispose: () => (nav.off(), el.remove()) }
}
