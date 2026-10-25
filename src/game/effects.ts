import { retain, TAU } from '../engine/math'
import { pick, range } from '../engine/rng'
import { placeDamage, SLOT_OFFSETS } from './damageText'
import type { Enemy, Game } from './types'
import * as dm from '../engine/dmath'

type BurstOpts = {
  colors: readonly string[]
  count: number
  speed?: number
  size?: number
  ttl?: number
  gravity?: number
  drag?: number
}

/**
 * Where a screen shake comes from: the acting player's own doing (`'own'`: a
 * hit taken, their move landing, their special), a spot in the world (a
 * boss's slam, a trap going off) or a moment the whole team watches
 * (`'team'`: a rift's entrance, a wave boss arriving).
 */
export type ShakeFrom = 'own' | 'team' | { x: number; y: number }

/**
 * Shakes the screen at least `amount` px (it fades in `updateEffects`). In
 * co-op every screen shakes on its own (`coop/shake.ts`), so the shell is
 * also told where it came from (a `shake` event): one player's own shake
 * never jolts a teammate's screen, and a spot shakes the screens it's on.
 * Solo it's only `g.shake`.
 */
export const shakeScreen = (g: Game, amount: number, from: ShakeFrom = 'own') => {
  g.shake = Math.max(g.shake, amount)
  tellShake(g, amount, from)
}

/** Sets the shake to `amount` outright, even under a stronger one (the few big moments that always did), told like `shakeScreen`. */
export const setScreenShake = (g: Game, amount: number, from: ShakeFrom) => {
  g.shake = amount
  tellShake(g, amount, from)
}

const tellShake = (g: Game, amount: number, from: ShakeFrom) => {
  if (g.coop === null) return
  if (typeof from === 'string') g.events.push({ kind: 'shake', amount, from, x: 0, y: 0 })
  else g.events.push({ kind: 'shake', amount, from: 'spot', x: from.x, y: from.y })
}

const MAX_PARTICLES = 900

/** Radial particle explosion (hits, faints, pickups…). */
export const burst = (g: Game, x: number, y: number, opts: BurstOpts) => {
  const { colors, count, speed = 60, size = 1, ttl = 0.4, gravity = 0, drag = 4 } = opts
  for (let i = 0; i < count && g.particles.length < MAX_PARTICLES; i++) {
    const a = range(g.rng, 0, TAU)
    const s = range(g.rng, speed * 0.3, speed)
    g.particles.push({
      x, y,
      vx: dm.cos(a) * s,
      vy: dm.sin(a) * s,
      life: 0,
      ttl: range(g.rng, ttl * 0.6, ttl),
      color: pick(g.rng, colors),
      size,
      gravity,
      drag,
    })
  }
}

const MAX_TEXTS = 120
const TEXT_RISE = -38

export const floatText = (g: Game, x: number, y: number, text: string, color: string, damage = false) => {
  if (g.texts.length > MAX_TEXTS) g.texts.shift()
  g.texts.push({ x: x + range(g.rng, -4, 4), y, vy: TEXT_RISE, life: 0, text, color, damage, target: -1, amount: 0, slot: 0 })
}

/**
 * A damage number over an enemy, grouped with its recent ones (`placeDamage`):
 * a merge adds to the total and pops it back over the target. `bang` marks
 * super-effective and critical hits (`12!`); they have their own color, so
 * they only group with each other.
 */
export const damageText = (g: Game, e: Enemy, amount: number, color: string, bang = false) => {
  const place = placeDamage(g.texts, e.id, color)
  if (place.kind === 'skip') return
  const ax = e.x
  const ay = e.y - e.radius * 2 - 4
  if (place.kind === 'new') {
    if (g.texts.length > MAX_TEXTS) g.texts.shift()
    const o = SLOT_OFFSETS[place.slot]!
    g.texts.push({ x: ax + o.x, y: ay + o.y, vy: TEXT_RISE, life: 0, text: `${amount}${bang ? '!' : ''}`, color, damage: true, target: e.id, amount, slot: place.slot })
    return
  }
  const t = g.texts[place.index]!
  const o = SLOT_OFFSETS[t.slot]!
  t.amount = place.kind === 'merge' ? t.amount + amount : amount
  t.text = `${t.amount}${bang ? '!' : ''}`
  t.x = ax + o.x
  t.y = ay + o.y
  t.vy = TEXT_RISE
  if (place.kind === 'recycle') {
    t.life = 0
    t.color = color
  }
}

export const updateEffects = (g: Game, dt: number) => {
  // Bursts share a few drags: each one's damping is worked out once a tick, not once a particle.
  let drag = NaN
  let damp = 1
  for (const p of g.particles) {
    p.life += dt
    p.vy += p.gravity * dt
    if (p.drag !== drag) {
      drag = p.drag
      damp = dm.exp(-drag * dt)
    }
    p.vx *= damp
    p.vy *= damp
    p.x += p.vx * dt
    p.y += p.vy * dt
  }
  retain(g.particles, (p) => p.life < p.ttl)

  const rise = dm.exp(-5 * dt)
  for (const t of g.texts) {
    t.life += dt
    t.y += t.vy * dt
    t.vy *= rise
  }
  retain(g.texts, (t) => t.life < 0.7)

  g.shake = Math.max(0, g.shake - dt * 18)
}
