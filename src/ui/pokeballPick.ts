import { playSfx } from '../engine/audio'
import type { Input } from '../engine/input'
import { MAX_ITEMS, MAX_MOVES } from '../game/leveling'
import type { Game, Offer } from '../game/types'
import { pokeballIcon } from '../render/art'
import { t } from '../i18n'
import { h } from './dom'
import { hint, menu, offerTile, type Screen } from './screens'
import { localPlayer } from '../game/players'

/** Taps this soon after the ball opens are ignored: a thumb still on the joystick can't decide for the player. */
const GUARD_MS = 650
/** The picked button's flourish before the screen closes. */
const PICK_MS = 280

/**
 * A Poké Ball's new move or held item (`decidePokeball` in `game/pickups.ts`):
 * the opened ball over the prize's level-up card, the slot it would take, and
 * two buttons, take it or leave it. Both go through `onChoose` like a
 * level-up pick (the prize or `pass`), so the replay records the choice.
 */
export const pokeballPick = (root: HTMLElement, input: Input, g: Game, onChoose: (offer: Offer) => void): Screen => {
  const m = t().pokeballPick
  const [prize] = localPlayer(g).offers
  const p = localPlayer(g)
  const slot = prize?.kind === 'item' ? m.itemSlot(p.items.length, MAX_ITEMS) : m.moveSlot(p.moves.length, MAX_MOVES)
  const buttons = localPlayer(g).offers.map((o) =>
    h('button', { class: o.kind === 'pass' ? 'btn ball-leave' : 'btn ball-take', type: 'button' }, o.kind === 'pass' ? m.leave : m.take),
  )
  const openedAt = performance.now()
  let done = false
  const nav = menu(input, buttons, (i) => {
    const picked = localPlayer(g).offers[i]
    if (done || !picked || performance.now() - openedAt < GUARD_MS) return
    done = true
    const take = picked.kind !== 'pass'
    playSfx(take ? 'item' : 'select')
    buttons[i]!.classList.add('picked')
    el.classList.add(take ? 'taking' : 'leaving')
    setTimeout(() => onChoose(picked), PICK_MS)
  }, { horizontal: true })
  // Up and down move between the two buttons too.
  const offArrows = input.onKey((key) => {
    if (key === 'ArrowUp' || key === 'KeyW') nav.focus(nav.index - 1)
    else if (key === 'ArrowDown' || key === 'KeyS') nav.focus(nav.index + 1)
  })
  const el = h(
    'div',
    { class: 'screen dim ball-pick' },
    h(
      'div',
      { class: 'dialog box pop ball-box' },
      h('div', { class: 'ball-label' }, h('img', { src: pokeballIcon(), alt: '' }), m.label),
      h('div', { class: 'dialog-title' }, m.title),
      prize && h('div', { class: 'ball-card' }, offerTile(g, prize)),
      h('p', { class: 'ball-slot' }, slot),
      h('p', { class: 'ball-note' }, m.note),
      h('div', { class: 'buttons' }, ...buttons),
      // Only a move's card opens the move card when held, so an item's hint just says tap.
      hint(t().levelUp.pairHintKeys, prize?.kind === 'item' ? m.itemHintTouch : t().levelUp.hintTouch),
    ),
  )
  root.append(el)
  return { el, dispose: () => (nav.off(), offArrows(), el.remove()) }
}
