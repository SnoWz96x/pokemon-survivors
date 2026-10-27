import { formatTime } from '../engine/math'
import { playSfx } from '../engine/audio'
import { isVersusPick, VERSUS, type Team } from '../data/versus'
import { formAt } from '../game/branch'
import type { Game } from '../game/types'
import { t } from '../i18n'
import { arenaIcon } from '../render/art'
import { teamColor } from './arena'
import { lineupSeat } from './arenaQueue'
import { h, setStyle } from './dom'

/**
 * A match's opening splash, while its sprites load (`startCoopRun`): both
 * lineups face each other (portraits, names, a bot's "CPU", roles, this
 * player lit), "Vale · 7:00", a gameplay tip that changes every few seconds
 * and a bar that follows the real loading. It stays `HOLD` at least so it
 * reads; then the match's own countdown takes over.
 */

const HOLD = 1.6
const TIP_EVERY = 3.2

export type VersusSplash = {
  el: HTMLElement
  /** The loading's progress, `done` of `total` sheets. */
  progress: (done: number, total: number) => void
  /** Resolves once the splash has shown `HOLD` seconds, with the bar full. */
  hold: () => Promise<void>
  dispose: () => void
}

export const versusSplash = (root: HTMLElement, g: Game, mySlot: number): VersusSplash => {
  const m = t().versus
  const s = m.splash
  const since = performance.now()
  const lineup = (team: Team) =>
    h(
      'div',
      { class: `arena-lineup team${team}`, style: `--team:${teamColor(team)}` },
      h('b', { class: 'arena-lineup-head' }, m.teams[team]),
      ...g.players
        .filter((p) => p.versus?.team === team)
        .map((p) => {
          const form = formAt(p.starter, p.branch, p.stage)
          const name = g.coop?.names[p.slot]?.trim()
          const me = p.slot === mySlot
          return lineupSeat(team, { dex: form.dex, name: me ? m.you : name || `${form.name} ${m.cpu}`, pick: isVersusPick(p.starter) ? p.starter : undefined, me, cpu: !name })
        }),
    )
  const fill = h('i', { class: 'arena-splash-fill' })
  const status = h('span', { class: 'arena-splash-status' }, s.loading)
  const tips = s.tips
  let tipAt = Math.floor(Math.random() * tips.length)
  const tip = h('p', { class: 'arena-splash-tip' }, h('b', {}, s.tip), h('span', {}, tips[tipAt]!))
  const mine = g.players[mySlot]?.versus?.team ?? 0
  const el = h(
    'div',
    { class: 'screen arena-splash' },
    h(
      'div',
      { class: 'arena-splash-box' },
      h('div', { class: 'arena-splash-head' }, h('img', { src: arenaIcon(), alt: '' }), h('b', {}, m.title), h('span', {}, `${m.map} · ${formatTime(VERSUS.length)}`)),
      // Your team on the left.
      h('div', { class: 'arena-lineups splash' }, lineup(mine), h('span', { class: 'arena-vs' }, 'VS'), lineup(mine === 0 ? 1 : 0)),
      tip,
      h('div', { class: 'arena-splash-bar' }, fill),
      status,
    ),
  )
  const rotate = setInterval(() => {
    tipAt = (tipAt + 1) % tips.length
    tip.lastElementChild!.textContent = tips[tipAt]!
  }, TIP_EVERY * 1000)
  root.append(el)
  playSfx('select', 0)

  const progress = (done: number, total: number) => setStyle(fill, 'width', `${Math.round((total > 0 ? done / total : 1) * 100)}%`)
  const hold = () => {
    progress(1, 1)
    status.textContent = s.ready
    const left = HOLD - (performance.now() - since) / 1000
    return new Promise<void>((res) => setTimeout(res, Math.max(250, left * 1000)))
  }
  return { el, progress, hold, dispose: () => (clearInterval(rotate), el.remove()) }
}
