import { playSfx } from '../engine/audio'
import type { Input } from '../engine/input'
import { CURSES } from '../data/curses'
import type { Game, Offer } from '../game/types'
import { curseIcon } from '../render/art'
import { t } from '../i18n'
import { h } from './dom'
import { hint, menu, type Screen } from './screens'
import { localPlayer } from '../game/players'

/** Taps this soon after the chest opens are ignored: a thumb still on the joystick can't decide for the player. */
const GUARD_MS = 650
/** The picked button's flourish before the screen closes. */
const PICK_MS = 320

/**
 * A locked chest's cursed item (`game/curseSystem.ts`): the item floats in its
 * purple aura with what it gives and what it costs, and two buttons, take it
 * or leave it. Both go through `onChoose` like a level-up pick, so the replay
 * records the choice as an `offer` event.
 */
export const cursePick = (root: HTMLElement, input: Input, g: Game, onChoose: (offer: Offer) => void): Screen => {
  const m = t()
  const offer = localPlayer(g).offers.find((o) => o.kind === 'curse')
  const id = offer?.kind === 'curse' ? offer.id : 'lifeOrb'
  const text = m.curses[id]
  const buttons = localPlayer(g).offers.map((o) =>
    h('button', { class: o.kind === 'curse' && o.take ? 'btn curse-take' : 'btn curse-leave', type: 'button' }, o.kind === 'curse' && o.take ? m.curse.take : m.curse.leave),
  )
  const openedAt = performance.now()
  let done = false
  const nav = menu(input, buttons, (i) => {
    const picked = localPlayer(g).offers[i]
    if (done || !picked || performance.now() - openedAt < GUARD_MS) return
    done = true
    playSfx(picked.kind === 'curse' && picked.take ? 'curseTake' : 'select')
    buttons[i]!.classList.add('picked')
    el.classList.add(picked.kind === 'curse' && picked.take ? 'taking' : 'leaving')
    setTimeout(() => onChoose(picked), PICK_MS)
  }, { horizontal: true })
  // Up and down move between the two buttons too.
  const offArrows = input.onKey((key) => {
    if (key === 'ArrowUp' || key === 'KeyW') nav.focus(nav.index - 1)
    else if (key === 'ArrowDown' || key === 'KeyS') nav.focus(nav.index + 1)
  })
  const el = h(
    'div',
    { class: 'screen dim curse-pick' },
    h(
      'div',
      { class: 'dialog box pop curse-box' },
      h('div', { class: 'curse-label' }, m.curse.label),
      h('div', { class: 'dialog-title' }, m.curse.title),
      h('p', { class: 'curse-sub' }, m.curse.subtitle),
      h('div', { class: 'curse-art' }, h('span', { class: 'curse-aura', 'aria-hidden': 'true' }), h('img', { src: curseIcon(id), alt: '' })),
      h('div', { class: 'curse-name' }, CURSES[id].name),
      h('p', { class: 'curse-line up' }, h('b', {}, '▲'), text.upside),
      h('p', { class: 'curse-line down' }, h('b', {}, '▼'), text.downside),
      h('p', { class: 'curse-note' }, m.curse.note),
      h('div', { class: 'buttons' }, ...buttons),
      hint(m.levelUp.pairHintKeys, m.levelUp.hintTouch),
    ),
  )
  root.append(el)
  playSfx('curseFound')
  return { el, dispose: () => (nav.off(), offArrows(), el.remove()) }
}
