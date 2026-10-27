import { playCry, playSfx } from '../engine/audio'
import { formatTime } from '../engine/math'
import { ENEMIES } from '../data/enemies'
import { VERSUS, type Team } from '../data/versus'
import { formAt } from '../game/branch'
import { localPlayer } from '../game/players'
import type { Game, GameEvent, Player } from '../game/types'
import { timeLeft } from '../game/versus'
import { t } from '../i18n'
import { cryUrl, portraitUrl } from '../render/sprites'
import { teamColor } from './arena'
import { h, rich, setStyle, setText } from './dom'
import { banner, runToast } from './toasts'

/**
 * A Versus match's own HUD, over the run's (`ui/hud.ts`, whose clock and
 * counters it hides): the score bar with the match clock and the stretch's
 * x2, the Energy carried, the respawn countdown, Zapdos's blessing and
 * Drednaw's shield, and the opening "3, 2, 1, Já!". Plus the match's toasts
 * (`versusFeedback`). Reads the draw copy every frame; touches only what changed.
 */

/** The name a seat goes by in a match: a human's, or a bot's Pokémon with "CPU" (a human who left keeps theirs). */
export const versusName = (g: Game, slot: number) => {
  const p = g.players[slot]
  if (!p) return '?'
  const name = g.coop?.names[slot]?.trim()
  if (name) return name
  return `${formAt(p.starter, p.branch, p.stage).name} ${t().versus.cpu}`
}

/** A seat's name for this screen: "Você" for the local player. */
const shownName = (g: Game, me: Player, slot: number) => (slot === me.slot ? t().versus.you : versusName(g, slot))

/** The opening countdown's first number, and how long "Já!" stays once the clock moves (s). */
const COUNTDOWN = 3
const GO = 0.8

/** `local`: a match against bots on the in-page relay (no connection to show). */
export const createVersusHud = (root: HTMLElement, local: boolean) => {
  const m = t().versus
  const blue = h('b', { class: 'vs-points' })
  const red = h('b', { class: 'vs-points' })
  const clock = h('span', { class: 'vs-clock' })
  const double = h('em', { class: 'vs-double hidden' }, m.hud.double)
  const bar = h(
    'div',
    { class: 'vs-score' },
    h('span', { class: 'vs-side blue', style: `--team:${teamColor(0)}` }, h('small', {}, m.hud.blue), blue),
    h('span', { class: 'vs-mid' }, clock, double),
    h('span', { class: 'vs-side red', style: `--team:${teamColor(1)}` }, red, h('small', {}, m.hud.red)),
  )
  const blessing = h('div', { class: 'vs-pill vs-blessing hidden' })
  const shield = h('div', { class: 'vs-pill vs-shield hidden' }, m.hud.shield)
  const energyText = h('b', { class: 'vs-energy-text' })
  const energyFill = h('i', { class: 'vs-energy-fill' })
  const energy = h('div', { class: 'vs-energy box', title: m.hud.energy }, h('span', { class: 'vs-orb', 'aria-hidden': 'true' }), energyText, h('span', { class: 'vs-energy-bar' }, energyFill))
  const respawn = h('div', { class: 'vs-respawn hidden' })
  const count = h('div', { class: 'vs-count hidden' })
  const el = h('div', { class: 'versus-hud' }, bar, h('div', { class: 'vs-pills' }, blessing, shield), energy, respawn, count)
  root.append(el)
  // The page knows a match is up (`style.css`): the co-op pip moves under the score, or goes against bots.
  document.documentElement.dataset.versus = local ? 'local' : 'room'
  // The run's HUD keeps its bars and buttons; its clock and counters make room for the score.
  const hud = () => root.querySelector('.hud')

  let shown = ''
  /** When this screen started waiting on tick 0 (s), for the countdown. */
  let waitedFrom: number | null = null
  const update = (g: Game, me: Player) => {
    const s = g.versus
    const v = me.versus
    if (!s || !v) return
    hud()?.classList.add('versus')
    const left = Math.ceil(timeLeft(g))
    const key = `${s.score[0]}|${s.score[1]}|${left}|${s.stretch}|${v.team}`
    if (key !== shown) {
      shown = key
      setText(blue, String(s.score[0]))
      setText(red, String(s.score[1]))
      setText(clock, formatTime(left))
      double.classList.toggle('hidden', !s.stretch)
      el.classList.toggle('stretch', s.stretch)
      el.classList.toggle('red-side', v.team === 1)
      bar.classList.toggle('last', left <= 10)
    }
    setText(energyText, `${v.energy}/${VERSUS.energy.cap}`)
    setStyle(energyFill, 'width', `${Math.round((v.energy / VERSUS.energy.cap) * 100)}%`)
    energy.classList.toggle('full', v.energy >= VERSUS.energy.cap)
    energy.classList.toggle('hidden', g.phase === 'gameover')
    const bless = s.blessing[v.team]
    blessing.classList.toggle('hidden', bless <= 0)
    if (bless > 0) setText(blessing, m.hud.blessing(Math.ceil(bless)))
    shield.classList.toggle('hidden', v.shield <= 0 || me.hp <= 0)
    const down = me.hp <= 0 && v.respawn > 0 && g.phase !== 'gameover'
    respawn.classList.toggle('hidden', !down)
    if (down) setText(respawn, m.hud.respawn(Math.ceil(v.respawn)))
    // The relay starts tick 0 a few seconds after the start: "3, 2, 1" while it waits (cosmetic), "Já!" as the clock moves.
    const now = performance.now() / 1000
    if (g.time === 0) waitedFrom ??= now
    const opening = g.phase === 'playing' && (g.time === 0 || g.time < GO)
    count.classList.toggle('hidden', !opening)
    if (opening) {
      const n = g.time > 0 ? 0 : Math.max(1, COUNTDOWN - Math.floor(now - (waitedFrom ?? now)))
      const text = n > 0 ? String(n) : m.hud.go
      if (count.textContent !== text) {
        count.textContent = text
        count.classList.remove('beat')
        void count.offsetWidth
        count.classList.add('beat')
        playSfx(n > 0 ? 'select' : 'levelUp', 0)
      }
    }
  }

  const dispose = () => {
    delete document.documentElement.dataset.versus
    hud()?.classList.remove('versus')
    el.remove()
  }
  return { el, update, dispose }
}

export type VersusHud = ReturnType<typeof createVersusHud>

/** A face for a toast: the seat's Pokémon now. */
const face = (p: Player | undefined) => p && h('img', { class: 'vs-toast-face', src: portraitUrl(formAt(p.starter, p.branch, p.stage).dex), alt: '' })

/** A toast's text in a team's color. */
const teamToast = (team: Team, ...children: (HTMLElement | false | undefined | null)[]) => h('span', { class: 'item-toast vs-toast', style: `--team:${teamColor(team)}` }, ...children)

/**
 * The match's moments as sounds and toasts, from this player's side: a score
 * (big, in the scorer's team color), a goal breaking, knockouts this player's
 * team took part in, the objectives arriving and falling, the stretch and the end.
 */
export const versusFeedback = (root: HTMLElement, g: Game, e: GameEvent) => {
  const me = localPlayer(g)
  const mine = me.versus?.team ?? 0
  const m = t().versus.toast
  switch (e.kind) {
    case 'versusScore': {
      const ours = e.team === mine
      playSfx(ours ? 'coin' : 'denied', 0)
      if (ours) playSfx('unlock', 0)
      const who = shownName(g, me, e.slot)
      const line = ours ? m.weScored(who) : m.theyScored(who)
      return runToast(root, 'important', teamToast(e.team, face(g.players[e.slot]), h('b', { class: 'vs-toast-points' }, `+${e.points}`), rich(line)), 3000)
    }
    case 'versusGoal': {
      const ours = e.team === mine
      playSfx('break', 0)
      return runToast(root, 'important', teamToast(e.team, h('span', {}, ours ? m.ourGoalBroke : m.theirGoalBroke)), 3200, 'versusGoal')
    }
    case 'versusKo': {
      const victim = g.players[e.slot]
      if (!victim) return
      if (e.slot === me.slot) {
        playSfx('hurt', 0)
        return runToast(root, 'important', teamToast(victim.versus?.team ?? 0, face(e.by >= 0 ? g.players[e.by] : undefined), rich(e.by >= 0 ? m.koYou(versusName(g, e.by)) : m.wildKoYou)), 2800, 'versusKoMe')
      }
      if (e.by === me.slot) {
        playSfx('kill', 0)
        playSfx('shiny', 0)
        return runToast(root, 'important', teamToast(mine, face(victim), rich(m.youKo(versusName(g, e.slot)))), 2600)
      }
      if (e.by < 0) return
      const killer = g.players[e.by]
      return runToast(root, 'minor', teamToast(killer?.versus?.team ?? 0, face(killer), rich(m.allyKo(versusName(g, e.by), versusName(g, e.slot)))), 2400)
    }
    case 'versusBack':
      if (e.slot !== me.slot) return
      playSfx('heal', 0)
      return runToast(root, 'minor', m.back, 1600, 'versusBack')
    case 'versusStretch':
      playSfx('thunder', 0)
      return banner(root, h('span', { class: 'vs-banner' }, h('b', {}, t().versus.hud.double), m.stretch), 3200)
    case 'versusObjective': {
      const def = ENEMIES[e.enemy]
      if (e.team === -1) {
        playSfx('boss', 0)
        playCry(cryUrl(def.dex), 0.6)
        return runToast(root, 'important', h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), rich(e.enemy === 'zapdos' ? m.zapdos : m.drednaw)), 3600, 'versusObjective')
      }
      const ours = e.team === mine
      playSfx(ours ? 'evolve' : 'denied', 0)
      return runToast(root, 'important', teamToast(e.team, h('img', { class: 'vs-toast-face', src: portraitUrl(def.dex), alt: '' }), rich(ours ? m.fellUs(def.name) : m.fellThem(def.name))), 3600, 'versusObjective')
    }
    case 'versusEnd': {
      const won = e.winner === mine
      playSfx(e.winner === null ? 'item' : won ? 'evolve' : 'gameOver', 0)
      return
    }
  }
}

/** The events `versusFeedback` speaks for. */
export const isVersusEvent = (e: GameEvent): e is Extract<GameEvent, { kind: `versus${string}` }> => e.kind.startsWith('versus')
