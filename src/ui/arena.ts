import { playSfx } from '../engine/audio'
import type { Input } from '../engine/input'
import { STARTERS } from '../data/starters'
import { isVersusPick, VERSUS_PICKS, VERSUS_ROSTER, type Role, type VersusPick } from '../data/versus'
import { t } from '../i18n'
import { arenaIcon } from '../render/art'
import { portraitUrl } from '../render/sprites'
import { h, later } from './dom'
import { stepGrid } from './gridNav'
import { hint, type Screen } from './screens'

/**
 * Arena (Versus) outside a match: the screen the lobby's tile opens (pick a
 * Pokémon from the 27 starters, the rules, and play against bots or with
 * friends) and, from an Arena room, the same picker to change the room's
 * Pokémon (`choose`). The pick is kept on the device (`ps:arenaPick`).
 */

/** Each team's color, the world's (`render/vale.ts`): the HUD, the room and the end screen use the same. */
export { teamColor } from '../render/vale'

/** Unite's role colors, for the chips. */
export const ROLE_COLORS = {
  attacker: '#f08030',
  speedster: '#3898f8',
  allRounder: '#a060e0',
  defender: '#48b040',
  supporter: '#e0a818',
} as const satisfies Record<Role, string>

/** A role as a colored chip (its name in this language). */
export const roleChip = (role: Role) => h('span', { class: 'arena-role', style: `--role:${ROLE_COLORS[role]}` }, t().versus.roles[role])

const PICK_KEY = 'ps:arenaPick'

/** The Pokémon this device last took into the Arena; `fallback` (the lobby's partner, when it's a starter) the first time. */
export const arenaPick = (fallback: string): VersusPick => {
  try {
    const kept = localStorage.getItem(PICK_KEY)
    if (kept && isVersusPick(kept)) return kept
  } catch {
    // Storage blocked: the fallback.
  }
  return isVersusPick(fallback) ? fallback : 'charmander'
}

export const keepArenaPick = (id: VersusPick) => {
  try {
    localStorage.setItem(PICK_KEY, id)
  } catch {
    // Storage blocked: the pick lasts this page.
  }
}

/** A starter's first form: its portrait's dex and its name. */
const firstForm = (id: VersusPick) => STARTERS[id].line[0]!

export type ArenaActions = {
  /** Jogar contra bots: a match at once on the in-page relay. */
  bots?: (id: VersusPick) => void
  /** Jogar com amigos: an Arena room (null: no relay in this build). */
  friends?: ((id: VersusPick) => void) | null
  /** From a room: the pick goes back to it. */
  choose?: (id: VersusPick) => void
  back: () => void
}

/**
 * The Arena screen. `pick` is the Pokémon selected first. ← → ↑ ↓ walk the
 * roster, Enter plays (or chooses, from a room), Esc goes back.
 */
export const arenaScreen = (root: HTMLElement, input: Input, pick: VersusPick, actions: ArenaActions): Screen => {
  const m = t().versus
  let selected = Math.max(0, VERSUS_PICKS.indexOf(pick))
  const chosen = () => VERSUS_PICKS[selected]!

  const name = h('b', { class: 'arena-chosen-name' })
  const role = h('span', { class: 'arena-chosen-role' })
  const face = h('img', { class: 'arena-chosen-face', alt: '' })

  const tiles = VERSUS_PICKS.map((id, i) => {
    const form = firstForm(id)
    const tile = h(
      'button',
      { class: 'arena-tile', type: 'button', 'aria-label': form.name, style: `--role:${ROLE_COLORS[VERSUS_ROSTER[id]]}` },
      h('img', { src: portraitUrl(form.dex), alt: '' }),
      h('span', { class: 'arena-tile-name' }, form.name),
    )
    tile.addEventListener('click', () => {
      if (selected === i) return
      playSfx('move')
      select(i)
    })
    // A second tap on the picked one plays (or chooses), as Enter would.
    tile.addEventListener('dblclick', () => primary())
    return tile
  })

  const select = (i: number, scroll = true) => {
    selected = i
    tiles.forEach((tile, k) => tile.classList.toggle('selected', k === i))
    const id = chosen()
    const form = firstForm(id)
    name.textContent = form.name
    face.src = portraitUrl(form.dex)
    role.replaceChildren(roleChip(VERSUS_ROSTER[id]))
    if (scroll) tiles[i]!.scrollIntoView({ block: 'nearest' })
  }

  let busy = false
  const go = (run: ((id: VersusPick) => void) | undefined | null) => () => {
    if (!run || busy) return
    busy = true
    playSfx('select')
    keepArenaPick(chosen())
    later(() => run(chosen()))
  }
  const choose = actions.choose
  const primary = go(choose ?? actions.bots)

  const button = (label: string, run: () => void, cls = 'btn') => h('button', { class: cls, type: 'button', onclick: run }, label)
  const buttons = choose
    ? [button(m.room.pick, primary, 'btn confirm')]
    : [
        button(m.bots, primary, 'btn confirm arena-bots'),
        actions.friends ? button(m.friends, go(actions.friends), 'btn arena-friends') : null,
      ]

  const grid = h('div', { class: 'arena-grid' }, ...tiles)
  const el = h(
    'div',
    { class: 'screen dim arena-screen' },
    h(
      'div',
      { class: 'dialog box pop arena' },
      h('div', { class: 'dialog-title arena-title' }, h('img', { src: arenaIcon(), alt: '' }), h('span', {}, m.title), h('em', { class: 'arena-tagline' }, m.tagline)),
      choose ? null : h('p', { class: 'arena-intro' }, m.intro),
      choose ? null : h('ul', { class: 'arena-rules' }, ...m.rules.map((line) => h('li', {}, line))),
      h('div', { class: 'arena-pick-head' }, h('span', { class: 'field-label' }, m.pick), h('small', {}, m.free)),
      grid,
      h('div', { class: 'arena-chosen' }, face, h('div', { class: 'arena-chosen-text' }, name, role)),
      h('div', { class: 'buttons arena-buttons' }, ...buttons, button(m.back, () => (playSfx('select'), later(actions.back)))),
      hint(m.hintKeys, m.hintTouch),
    ),
  )

  /** How many tiles fit a row now (the grid wraps with the screen). */
  const cols = () => {
    const top = tiles[0]?.offsetTop ?? 0
    const n = tiles.findIndex((tile) => tile.offsetTop !== top)
    return n > 0 ? n : tiles.length
  }
  const off = input.onKey((key) => {
    const step = key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : null
    if (step) {
      const next = stepGrid(selected, step, cols(), tiles.length)
      if (typeof next === 'number' && next !== selected) {
        playSfx('move')
        select(next)
      }
      return
    }
    if (key === 'Enter') primary()
    else if (key === 'Escape' || key === 'Backspace') {
      playSfx('select')
      later(actions.back)
    }
  })
  root.append(el)
  select(selected, false)
  later(() => tiles[selected]?.scrollIntoView({ block: 'nearest' }))
  return { el, dim: 0.5, dispose: () => (off(), el.remove()) }
}
