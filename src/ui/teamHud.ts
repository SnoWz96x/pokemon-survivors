import { COOP } from '../data/coop'
import { formAt } from '../game/branch'
import { fainted } from '../game/coop'
import type { Game, Player } from '../game/types'
import { t } from '../i18n'
import { teamAwayIcon, teamBallIcon, sparkleIcon } from '../render/art'
import { portraitUrl } from '../render/sprites'
import { busyWith, slotColor } from '../render/team'
import { h, setStyle, setText } from './dom'

/** The name the team sees for a seat: the one it joined with, or "Jogador 2". */
export const seatName = (g: Game, slot: number) => g.coop?.names[slot]?.trim() || t().team.player(slot + 1)

/** What a teammate's card says they're up to, or null while they just play. */
type CardState = 'fainted' | 'away' | 'choosing' | 'evolving' | 'left' | null

const stateOf = (p: Player): CardState => {
  if (p.gone) return 'left'
  if (fainted(p)) return 'fainted'
  if (p.away) return 'away'
  const busy = busyWith(p)
  if (busy === 'evolve' || busy === 'mega') return 'evolving'
  return busy ? 'choosing' : null
}

type Card = { el: HTMLElement; portrait: HTMLImageElement; badge: HTMLImageElement; level: HTMLElement; fill: HTMLElement; state: HTMLElement; clock: HTMLElement; key: string; mode: string }

/**
 * Co-op HUD: one compact card per teammate (not the client's own player, whose
 * status box is the HUD's), in seat order: their Pokémon's portrait framed in
 * their seat color, name, level and HP, or what keeps them out (fainted,
 * away, choosing, evolving, left) with a pick screen's clock. Three cards fit
 * a phone held upright in one row under the top bar; landscape stacks them on
 * the left (`style.css`). `update` runs every frame and only touches what changed.
 */
export const createTeamHud = (root: HTMLElement) => {
  const el = h('div', { class: 'team-hud' })
  const cards = new Map<number, Card>()

  const cardFor = (g: Game, p: Player) => {
    const known = cards.get(p.slot)
    if (known) return known
    const portrait = h('img', { class: 'team-portrait', alt: '' })
    const badge = h('img', { class: 'team-badge hidden', alt: '' })
    const level = h('span', { class: 'team-level' })
    const fill = h('div', { class: 'hp-fill hp-high' })
    const state = h('span', { class: 'team-state hidden' })
    const clock = h('div', { class: 'team-clock hidden' })
    const card = h(
      'div',
      { class: 'team-card', style: `--slot:${slotColor(p.slot)}` },
      h('div', { class: 'team-face' }, portrait, badge),
      h(
        'div',
        { class: 'team-body' },
        h('div', { class: 'team-head' }, h('b', { class: 'team-name' }, seatName(g, p.slot)), level),
        h('div', { class: 'team-hp' }, fill),
        state,
      ),
      clock,
    )
    const made: Card = { el: card, portrait, badge, level, fill, state, clock, key: '', mode: '' }
    cards.set(p.slot, made)
    el.append(card)
    return made
  }

  /** In the HUD's flow right under its top bar, so it follows the bar's height on every screen; the HUD is rebuilt on a language switch. */
  const place = () => {
    const row = root.querySelector('.hud .hud-row')
    if (row) row.after(el)
    else root.append(el)
  }

  const update = (g: Game, me: Player) => {
    if (!el.isConnected) place()
    for (const p of g.players) {
      if (p === me) continue
      const card = cardFor(g, p)
      const dex = formAt(p.starter, p.branch, p.stage).dex
      const key = `${dex}${p.shiny}`
      if (key !== card.key) {
        card.key = key
        card.portrait.src = portraitUrl(dex, p.shiny)
      }
      const state = stateOf(p)
      const mode = state ?? ''
      if (mode !== card.mode) {
        card.mode = mode
        card.el.className = state ? `team-card ${state}` : 'team-card'
        card.state.classList.toggle('hidden', !state)
        setText(card.state, state ? t().team.state[state] : '')
        const icon = state === 'fainted' ? teamBallIcon() : state === 'away' ? teamAwayIcon() : state === 'evolving' ? sparkleIcon() : null
        card.badge.classList.toggle('hidden', !icon)
        if (icon) card.badge.src = icon
      }
      setText(card.level, t().levelShort(p.level))
      const ratio = Math.max(0, Math.min(1, p.hp / p.stats.maxHp))
      setStyle(card.fill, 'width', `${Math.round(ratio * 100)}%`)
      const cls = `hp-fill ${ratio > 0.5 ? 'hp-high' : ratio > 0.2 ? 'hp-mid' : 'hp-low'}`
      if (card.fill.className !== cls) card.fill.className = cls
      // A pick screen's clock drains under the card while they choose.
      const choosing = state === 'choosing'
      card.clock.classList.toggle('hidden', !choosing)
      if (choosing) setStyle(card.clock, '--left', `${Math.max(0, Math.min(1, p.pickLeft / COOP.pick.time)).toFixed(2)}`)
    }
  }

  place()
  return { el, update, dispose: () => el.remove() }
}

export type TeamHud = ReturnType<typeof createTeamHud>
