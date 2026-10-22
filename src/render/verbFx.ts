import { blitCentered, blitEllipse, blitRotated } from '../engine/pixelart'
import { TAU } from '../engine/math'
import { hash2 } from '../engine/rng'
import { stacksOf } from '../game/kitRules'
import { moveStats } from '../game/moves'
import { focusCharge, SOLAR, SUCKER, TAIL } from '../game/moveVerbs'
import { gyroMult, roostSettle } from '../game/moveVerbRules'
import type { Attack, Game, Player } from '../game/types'
import { VERB_FX } from './art'
import { dashedRing } from './strokes'
import { localPlayer, ownerOf } from '../game/players'

/**
 * Art of the verb moves (`game/moveVerbs.ts`). `draw.ts` calls the two passes
 * once a frame: `drawVerbGround` under the Pokémon (fire patches, puddles,
 * rings on the floor) and `drawVerbAir` over them (orbs, beams, fists,
 * columns). Both walk `g.attacks` themselves, so they can read each hitbox's
 * caster (`ownerOf`: Gyro Ball's grind, Solar Beam's mouth). What a player
 * wears from their own state (Roost, Focus Punch's charge, Sucker Punch's
 * zone) is `drawVerbPlayerGround` and `drawVerbPlayerAir`, drawn for each player.
 * Everything snaps to whole pixels.
 */

type Ctx = CanvasRenderingContext2D

const px = (ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

const fadeOut = (a: Attack, window: number) => Math.max(0, Math.min(1, (a.ttl - a.age) / window))
const radiusOf = (a: Attack) => (a.shape.kind === 'circle' ? a.shape.r : 8)

/** Square-brush line from (x0, y0) to (x1, y1), `w` px thick. */
const thickLine = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string) => {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)))
  const half = Math.floor(w / 2)
  ctx.fillStyle = color
  for (let i = 0; i <= n; i++) {
    const k = i / n
    ctx.fillRect(Math.round(x0 + (x1 - x0) * k) - half, Math.round(y0 + (y1 - y0) * k) - half, w, w)
  }
}

/** A small 4-point twinkle. */
const twinkle = (ctx: Ctx, x: number, y: number, size: number, color: string) => {
  px(ctx, x - size, y, color, size * 2 + 1, 1)
  px(ctx, x, y - size, color, 1, size * 2 + 1)
}

/** Impact spokes around (x, y): `count` rays from `inner` to `outer`, alternating long and short. */
const spokes = (ctx: Ctx, x: number, y: number, inner: number, outer: number, count: number, colors: readonly string[], turn = 0) => {
  for (let i = 0; i < count; i++) {
    const a = turn + (i / count) * TAU
    const len = i % 2 === 0 ? outer : inner + (outer - inner) * 0.55
    for (let d = inner; d <= len; d++) px(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, colors[Math.min(colors.length - 1, Math.floor(((d - inner) / Math.max(1, len - inner)) * colors.length))]!)
  }
}

const ownedOf = (g: Game, id: 'roost' | 'focusPunch' | 'suckerPunch') => localPlayer(g).moves.find((m) => m.id === id)

/* ---------------- Ground pass ---------------- */

/** Flame Wheel's patch: a scorched glow with a flame licking up, shrinking as it burns out. */
const drawFlameTrail = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const life = 1 - a.age / a.ttl
  ctx.globalAlpha = Math.min(1, life * 1.6)
  blitEllipse(ctx, Math.round(r * 0.9), Math.max(1, Math.round(r * 0.4)), 'rgba(200,64,16,0.32)', a.x, a.y)
  blitEllipse(ctx, Math.round(r * 0.5), Math.max(1, Math.round(r * 0.22)), 'rgba(248,176,48,0.45)', a.x, a.y)
  const frames = VERB_FX.flameLick()
  const sprite = frames[Math.floor((t * 10 + a.id) % 2)]!
  // Young flames stand tall; old ones sink into embers.
  const sink = Math.round((1 - life) * 5)
  ctx.save()
  ctx.beginPath()
  ctx.rect(Math.round(a.x - 6), Math.round(a.y - 14), 12, 14 - sink + 1)
  ctx.clip()
  blitCentered(ctx, sprite, a.x + (a.flip ? 1 : 0), a.y - 4 + sink)
  ctx.restore()
  ctx.globalAlpha = 1
}

/** Flame Wheel's carrier: a wheel of fire rolling around `p`'s feet while they walk; embers waiting while still. */
const drawFlameWheel = (ctx: Ctx, p: Player, t: number) => {
  const spin = p.walked * 0.12
  const lit = p.moving
  const n = 8
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * TAU
    const x = p.x + Math.cos(a) * 13
    const y = p.y - 2 + Math.sin(a) * 5
    if (!lit) {
      if ((Math.floor(t * 3) + i) % 3 === 0) px(ctx, x, y, i % 2 ? '#f08030' : '#a82010')
      continue
    }
    const tall = 2 + ((Math.floor(t * 16) + i) % 3)
    px(ctx, x - 1, y - tall, '#e85818', 3, tall)
    px(ctx, x, y - tall - 1, '#f8b030', 1, tall)
    px(ctx, x, y - 1, '#fff4b0')
  }
  if (lit) dashedRing(ctx, p.x, p.y - 2, 13, spin * 3, ['#f8b030', '#e85818', '#a82010'], 0.6, 0.4)
}

/** Sheer Cold's floor: a pale icy disk with frost cracks under the ring. */
const drawSheerColdGround = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  ctx.globalAlpha = Math.max(0, 1 - k * k) * 0.9
  blitEllipse(ctx, Math.round(r), Math.max(1, Math.round(r * 0.5)), 'rgba(200,240,255,0.22)', a.x, a.y)
  ctx.fillStyle = '#e0f8ff'
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * TAU + a.id
    for (let d = 6; d < r - 2; d += 2) {
      const jag = Math.sin(d * 0.5 + i * 3) * 1.5
      ctx.fillRect(Math.round(a.x + Math.cos(ang) * d - Math.sin(ang) * jag), Math.round(a.y + (Math.sin(ang) * d + Math.cos(ang) * jag) * 0.5), 1, 1)
    }
  }
  ctx.globalAlpha = 1
}

/** Future Sight's mark: an eye over the warning ring, opening as the columns come. */
const drawFutureMark = (ctx: Ctx, a: Attack, t: number) => {
  const k = Math.min(1, a.age / a.ttl)
  const eye = VERB_FX.eye()
  const open = Math.max(1, Math.round(eye.height * Math.min(1, k * 1.6)))
  const y = a.y - 16 - Math.round(Math.sin(t * 3 + a.id) * 1.5)
  ctx.globalAlpha = 0.5 + 0.5 * k
  ctx.drawImage(eye, 0, Math.floor((eye.height - open) / 2), eye.width, open, Math.round(a.x - eye.width / 2), Math.round(y - open / 2), eye.width, open)
  ctx.globalAlpha = 1
  // Motes rising from the mark into the eye.
  for (let i = 0; i < 4; i++) {
    const ph = (t * 1.2 + hash2(a.id, i)) % 1
    px(ctx, a.x + (hash2(a.id, i, 2) - 0.5) * radiusOf(a) * 1.4, a.y - ph * 14, i % 2 ? '#ffd0e8' : '#f85888')
  }
}

/** Roost: a ring filling up while the player keeps still, then a nest of feathers on the floor once settled. */
const drawRoostGround = (ctx: Ctx, g: Game, t: number) => {
  const owned = ownedOf(g, 'roost')
  const p = localPlayer(g)
  if (!owned || p.moving || p.hidden) return
  const settle = roostSettle(owned)
  const k = Math.min(1, p.still / settle)
  if (k < 1) {
    if (p.still < 0.15) return
    const steps = 24
    for (let i = 0; i < steps * k; i++) {
      const a = -Math.PI / 2 + (i / steps) * TAU
      px(ctx, p.x + Math.cos(a) * 12, p.y + 1 + Math.sin(a) * 5, i % 2 ? '#a890f0' : '#ffffff')
    }
    return
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3
    const x = p.x + Math.cos(a) * 11
    const y = p.y + 1 + Math.sin(a) * 4
    px(ctx, x - 2, y, '#806040', 4, 1)
    px(ctx, x - 1, y - 1, i % 2 ? '#e8e0f8' : '#a890f0', 2, 1)
  }
  dashedRing(ctx, p.x, p.y + 1, 14, t * 2, ['#78f878', '#d8f8c8'], 0.35, 0.4)
}

/** Sucker Punch's zone: a faint dark ring around the feet, where the jab answers. */
const drawSuckerZone = (ctx: Ctx, g: Game, t: number) => {
  const owned = ownedOf(g, 'suckerPunch')
  if (!owned) return
  const p = localPlayer(g)
  const area = moveStats('suckerPunch', owned.level, p.stats, owned.path).area
  ctx.globalAlpha = 0.45
  dashedRing(ctx, p.x, p.y - 2, (SUCKER.reach + p.radius) * area, t * 1.5, ['#382838', '#6a5068'], 0.3, 0.45)
  ctx.globalAlpha = 1
}

/** Focus Punch charging, on the floor: a ring under the feet that widens and brightens with the charge. */
const drawFocusGround = (ctx: Ctx, g: Game, t: number) => {
  const owned = ownedOf(g, 'focusPunch')
  const p = localPlayer(g)
  if (!owned || p.hidden) return
  const k = Math.min(1, Math.max(0, stacksOf(owned)) / focusCharge(owned))
  if (k <= 0) return
  const full = k >= 1
  ctx.globalAlpha = 0.45 + 0.55 * k
  blitEllipse(ctx, Math.round(8 + k * 6), Math.max(1, Math.round(3 + k * 2)), full ? 'rgba(248,112,64,0.45)' : 'rgba(192,48,40,0.3)', p.x, p.y)
  dashedRing(ctx, p.x, p.y, 10 + k * 6, t * (3 + k * 6), full ? ['#ffffff', '#f8d030', '#f87040'] : ['#f87040', '#c03028'], 0.3 + 0.5 * k, 0.42)
  ctx.globalAlpha = 1
}

/** On the floor around `g`'s player, from their own moves: Sucker Punch's zone, Focus Punch's charge, Roost. */
export const drawVerbPlayerGround = (ctx: Ctx, g: Game, t: number) => {
  drawSuckerZone(ctx, g, t)
  drawFocusGround(ctx, g, t)
  drawRoostGround(ctx, g, t)
}

/** Ground layer (under the Pokémon). */
export const drawVerbGround = (ctx: Ctx, g: Game, t: number) => {
  // Players rolling a Flame Wheel, one bit per slot.
  let wheels = 0
  for (const a of g.attacks) {
    if (a.age < 0) continue
    switch (a.visual) {
      case 'flameTrail':
        drawFlameTrail(ctx, a, t)
        break
      case 'flameWheel':
        wheels |= 1 << a.owner
        break
      case 'sheerCold':
        drawSheerColdGround(ctx, a)
        break
      case 'telegraph':
        if (a.move === 'futureSight') drawFutureMark(ctx, a, t)
        break
      case 'stealthRock': {
        const rise = Math.min(1, a.age / 0.2)
        ctx.globalAlpha = rise * fadeOut(a, 0.6)
        blitEllipse(ctx, 4, 1, 'rgba(24,16,8,0.35)', a.x, a.y + 2)
        ctx.globalAlpha = 1
        break
      }
      case 'selfDestruct': {
        // The scorch mark it leaves behind.
        ctx.globalAlpha = fadeOut(a, 0.35) * 0.8
        const r = radiusOf(a)
        blitEllipse(ctx, Math.round(r * 0.8), Math.max(1, Math.round(r * 0.38)), 'rgba(40,24,16,0.4)', a.x, a.y + 8)
        ctx.globalAlpha = 1
        break
      }
      case 'brine': {
        if (a.age < a.activeFrom) {
          // The shadow of the lob closing in on its landing spot.
          const k = a.age / a.activeFrom
          blitEllipse(ctx, Math.max(1, Math.round(3 + k * 5)), Math.max(1, Math.round(1 + k * 2)), 'rgba(16,24,48,0.3)', a.x, a.y + 6)
          break
        }
        const e = (a.age - a.activeFrom) / (a.ttl - a.activeFrom)
        const r = radiusOf(a)
        ctx.globalAlpha = Math.max(0, 1 - e)
        blitEllipse(ctx, Math.round(r * (0.6 + 0.5 * e)), Math.max(1, Math.round(r * 0.32 * (0.6 + 0.5 * e))), 'rgba(72,120,208,0.45)', a.x, a.y + 6)
        dashedRing(ctx, a.x, a.y + 6, r * (0.7 + 0.6 * e), a.id, ['#ffffff', '#88b8f0'], 0.6, 0.35)
        ctx.globalAlpha = 1
        break
      }
    }
  }
  for (let slot = 0; wheels >> slot; slot++) if ((wheels >> slot) & 1) drawFlameWheel(ctx, ownerOf(g, slot), t)
}

/* ---------------- Air pass ---------------- */

/** Solar Beam gathering light at the mouth, with a faint fan where the beam will sweep. */
const drawSolarCharge = (ctx: Ctx, g: Game, a: Attack, t: number) => {
  const m = a.motion
  if (m.kind !== 'orbit') return
  const k = Math.min(1, a.age / a.ttl)
  // Where the sweep will go: the dormant tip of the same beam tells how long it is.
  const tip = g.attacks.find((o) => o.move === 'solarBeam' && o.owner === a.owner && o.flip && o.age < 0 && o.motion.kind === 'orbit' && Math.abs(o.motion.angle - m.angle) < 1e-6)
  const length = tip && tip.motion.kind === 'orbit' ? tip.motion.radius : SOLAR.length
  const p = ownerOf(g, a.owner)
  ctx.globalAlpha = 0.25 + 0.35 * k
  const dots = 18
  for (let i = 0; i <= dots; i++) {
    const ang = m.angle + (i / dots) * SOLAR.arc
    if ((i + Math.floor(t * 12)) % 3 === 0) continue
    px(ctx, p.x + Math.cos(ang) * length, p.y - 8 + Math.sin(ang) * length, i % 2 ? '#c8f088' : '#ffffff')
  }
  for (let d = 14; d < length; d += 5) {
    if (Math.floor(d / 5 + t * 18) % 2 === 0) px(ctx, p.x + Math.cos(m.angle) * d, p.y - 8 + Math.sin(m.angle) * d, '#f8f8a0')
  }
  ctx.globalAlpha = 1
  // Motes spiraling into the mouth.
  for (let i = 0; i < 12; i++) {
    const ph = (k * 1.5 + hash2(a.id, i)) % 1
    const ang = hash2(a.id, i, 3) * TAU + ph * 2
    const d = (1 - ph) * 30
    px(ctx, a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d, i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f8f8a0' : '#78c850', ph > 0.7 ? 2 : 1, ph > 0.7 ? 2 : 1)
  }
  const glow = 1 + Math.round(k * 5)
  blitEllipse(ctx, glow + 2, glow + 2, 'rgba(200,240,136,0.45)', a.x, a.y)
  blitEllipse(ctx, glow, glow, '#f8f8c0', a.x, a.y)
  if (glow > 2) blitEllipse(ctx, glow - 2, glow - 2, '#ffffff', a.x, a.y)
  if (k > 0.75 && Math.floor(t * 20) % 2 === 0) twinkle(ctx, a.x, a.y, 4 + glow, '#ffffff')
}

/**
 * Solar Beam: every live beam drawn layer by layer over all its slices (outer
 * glow, pale body, white core), so the slices join into one solid beam. Each
 * slice covers the gap to its neighbors.
 */
const drawSolarBeams = (ctx: Ctx, g: Game, t: number) => {
  const layers = [
    { k: 1.5, color: 'rgba(120,200,80,0.6)', flick: true },
    { k: 0.95, color: '#d8f8a0', flick: false },
    { k: 0.4, color: '#ffffff', flick: false },
  ] as const
  for (const layer of layers) {
    for (const a of g.attacks) {
      const m = a.motion
      if (a.visual !== 'solarBeam' || a.age < 0 || m.kind !== 'orbit') continue
      const p = ownerOf(g, a.owner)
      const r = radiusOf(a)
      const k = a.age / a.ttl
      // Swells in fast, narrows out at the end.
      const w = r * Math.min(1, a.age / 0.06) * Math.min(1, (1 - k) / 0.25 + 0.2)
      const half = Math.max(5, ((SOLAR.length * r) / SOLAR.r - 12) / (SOLAR.segments - 1) / 2 + 1)
      const cx = Math.cos(m.angle)
      const cy = Math.sin(m.angle)
      const flick = layer.flick ? Math.floor(t * 30 + m.radius) % 2 : 0
      thickLine(ctx, p.x + cx * (m.radius - half), p.y - 8 + cy * (m.radius - half), p.x + cx * (m.radius + half), p.y - 8 + cy * (m.radius + half), Math.max(1, Math.round(w * layer.k)) + flick, layer.color)
      if (layer.k < 1 && m.radius < 14) blitEllipse(ctx, Math.round(w * 0.6) + 1, Math.round(w * 0.6) + 1, '#f8f8c0', p.x + cx * 10, p.y - 8 + cy * 10)
      if (layer.k < 1 && a.flip) spokes(ctx, a.x, a.y, 2, Math.round(w * 1.4) + 4, 8, ['#ffffff', '#d8f8a0', '#78c850'], t * 6)
    }
  }
}

/** Brine in flight: a ball lobbed from the player; on landing a splash column with salt flying off. */
const drawBrine = (ctx: Ctx, a: Attack) => {
  if (a.age < a.activeFrom) {
    const k = a.age / a.activeFrom
    const x = a.from.x + (a.x - a.from.x) * k
    const y = a.from.y + (a.y - a.from.y) * k - Math.sin(k * Math.PI) * 30
    blitRotated(ctx, VERB_FX.brine(), x, y, a.age * 12)
    return
  }
  const e = (a.age - a.activeFrom) / (a.ttl - a.activeFrom)
  const r = radiusOf(a)
  ctx.globalAlpha = Math.max(0, 1 - e * e)
  // A column of water rising and falling apart.
  const h = Math.round(r * 1.6 * Math.sin(Math.min(1, e * 1.6) * Math.PI))
  if (h > 0) {
    px(ctx, a.x - 5, a.y + 6 - h, '#3868c8', 11, h)
    px(ctx, a.x - 3, a.y + 6 - h, '#88b8f0', 6, h)
    px(ctx, a.x - 1, a.y + 6 - h, '#ffffff', 2, h)
    px(ctx, a.x - 6, a.y + 6 - h, '#ffffff', 13, 1)
  }
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (hash2(a.id, i) - 0.5) * 2.6
    const sp = 18 + hash2(a.id, i, 1) * 26
    const x = a.x + Math.cos(ang) * sp * e * 1.4
    const y = a.y + 2 + Math.sin(ang) * sp * e * 1.4 + 60 * e * e
    if (i < 4) {
      // Salt crystals glinting.
      px(ctx, x, y - 1, '#ffffff')
      px(ctx, x - 1, y, '#ffffff', 3, 1)
      px(ctx, x, y + 1, '#ffffff')
    } else px(ctx, x, y, i % 2 ? '#88b8f0' : '#3868c8', 2, 2)
  }
  ctx.globalAlpha = 1
}

/** Electro Ball: the orb (bigger with speed) crackling with short arcs. */
const drawElectroBall = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const sprite = VERB_FX.electro()
  const scale = Math.max(1, Math.round((r * 2) / sprite.width))
  const m = a.motion
  if (m.kind === 'linear') {
    const len = Math.hypot(m.vx, m.vy) || 1
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.5 - i * 0.13
      blitEllipse(ctx, Math.max(1, Math.round(r * (1 - i * 0.2))), Math.max(1, Math.round(r * (1 - i * 0.2))), '#f8d030', a.x - (m.vx / len) * i * r * 0.7, a.y - (m.vy / len) * i * r * 0.7)
    }
    ctx.globalAlpha = 1
  }
  blitRotated(ctx, sprite, a.x, a.y, Math.floor(t * 8) * (Math.PI / 2), scale)
  const seed = Math.floor(t * 20) + a.id * 7
  for (let s = 0; s < 3; s++) {
    let ang = hash2(seed, s) * TAU
    let x = a.x + Math.cos(ang) * r
    let y = a.y + Math.sin(ang) * r
    for (let k = 0; k < 4; k++) {
      ang += (hash2(seed, s, k) - 0.5) * 1.6
      x += Math.cos(ang) * 2
      y += Math.sin(ang) * 2
      px(ctx, x, y, k % 2 ? '#ffffff' : '#f8e870')
    }
  }
}

/** Venoshock's glob wobbling along, dripping. */
const drawGlob = (ctx: Ctx, a: Attack, t: number) => {
  const m = a.motion
  const wob = Math.round(Math.sin(a.age * 18) * 1)
  blitCentered(ctx, VERB_FX.glob(), a.x, a.y + wob)
  if (m.kind === 'homing') {
    const len = Math.hypot(m.vx, m.vy) || 1
    for (let i = 1; i <= 3; i++) px(ctx, a.x - (m.vx / len) * i * 4, a.y - (m.vy / len) * i * 4 + i, i === 1 ? '#d080e0' : '#9038a0', i === 1 ? 2 : 1, i === 1 ? 2 : 1)
  }
  if (Math.floor(t * 6 + a.id) % 3 === 0) px(ctx, a.x + 1, a.y + 5 + wob, '#b8f060')
}

/** Self-Destruct: a white-hot ball blooming into fire, then a smoke ring rolling out. */
const drawSelfDestruct = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  if (a.age <= a.activeUntil) {
    const flick = Math.floor(t * 30) % 2
    blitEllipse(ctx, Math.round(r), Math.round(r * 0.8), 'rgba(216,64,32,0.75)', a.x, a.y)
    blitEllipse(ctx, Math.round(r * 0.8), Math.round(r * 0.64), '#f8a030', a.x, a.y - flick)
    blitEllipse(ctx, Math.round(r * 0.55), Math.round(r * 0.45), '#fff0a0', a.x, a.y - 1)
    blitEllipse(ctx, Math.round(r * 0.3), Math.round(r * 0.25), '#ffffff', a.x, a.y - 1)
    spokes(ctx, a.x, a.y, Math.round(r * 0.9), Math.round(r * 1.25), 12, ['#ffffff', '#fff0a0', '#f8a030'], a.id)
    return
  }
  const e = (a.age - a.activeUntil) / (a.ttl - a.activeUntil)
  ctx.globalAlpha = Math.max(0, 1 - e)
  blitEllipse(ctx, Math.round(r * (1 - e * 0.5)), Math.round(r * 0.8 * (1 - e * 0.5)), 'rgba(248,160,48,0.35)', a.x, a.y - e * 10)
  dashedRing(ctx, a.x, a.y, r * (1 + e * 0.35), a.id + e * 3, ['#686060', '#a09890', '#484040'], 0.85, 0.75)
  dashedRing(ctx, a.x, a.y - 2, r * (0.85 + e * 0.3), -a.id - e * 4, ['#d8d0c8', '#888078'], 0.6, 0.75)
  ctx.globalAlpha = 1
}

/** Roost's landing gust: feathers flung out on a white ring. */
const drawRoostGust = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  ctx.globalAlpha = fadeOut(a, 0.15)
  dashedRing(ctx, a.x, a.y, r, a.age * 18, ['#ffffff', '#e8e0f8', '#a890f0'], 0.7, 0.6)
  const feather = VERB_FX.feather()
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + a.id
    blitRotated(ctx, feather, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r * 0.6, ang + Math.PI / 2 + a.age * 10)
  }
  ctx.globalAlpha = 1
}

/** Roost while settled: feathers drifting down around the player, green motes rising. */
const drawRoostAir = (ctx: Ctx, g: Game, t: number) => {
  const owned = ownedOf(g, 'roost')
  const p = localPlayer(g)
  if (!owned || p.moving || p.hidden || p.still < roostSettle(owned)) return
  const feather = VERB_FX.feather()
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.45 + i / 3) % 1
    const x = p.x + (hash2(i, Math.floor(t * 0.45 + i / 3)) - 0.5) * 30 + Math.sin(t * 3 + i) * 4
    const y = p.y - 40 + ph * 40
    ctx.globalAlpha = Math.min(1, (1 - ph) * 3)
    blitRotated(ctx, feather, x, y, Math.sin(t * 3 + i) * 0.6)
  }
  ctx.globalAlpha = 1
}

/** Focus Punch charging: sparks rising around the body, more and brighter as the charge fills, blazing once full. */
const drawFocusAura = (ctx: Ctx, g: Game, t: number) => {
  const owned = ownedOf(g, 'focusPunch')
  const p = localPlayer(g)
  if (!owned || p.hidden) return
  const k = Math.min(1, Math.max(0, stacksOf(owned)) / focusCharge(owned))
  if (k <= 0) return
  const full = k >= 1
  const n = Math.round(4 + k * 14)
  const w = 9 + k * 4
  for (let i = 0; i < n; i++) {
    const ph = (t * (1.4 + k) + hash2(i, 9)) % 1
    const side = hash2(i, 4) * TAU
    const x = p.x + Math.cos(side) * w
    const y = p.y - 2 - ph * (16 + k * 12) + Math.sin(side) * 3
    ctx.globalAlpha = 1 - ph
    const c = full ? (i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f8d030' : '#f87040') : i % 2 ? '#f87040' : '#c03028'
    px(ctx, x, y, c, k > 0.5 ? 2 : 1, k > 0.5 ? 2 : 1)
  }
  ctx.globalAlpha = 1
  if (full) {
    const pulse = Math.floor(t * 8) % 2
    dashedRing(ctx, p.x, p.y - 12, 15 + pulse, t * 6, ['#ffffff', '#f8d030', '#c03028'], 0.55)
    if (Math.floor(t * 4) % 2 === 0) twinkle(ctx, p.x + 11, p.y - 26, 2, '#ffffff')
  }
}

/** Focus Punch landing: the big fist slamming in, then a star of impact. */
const drawFocusPunch = (ctx: Ctx, a: Attack, t: number) => {
  const ang = Math.atan2(a.y - a.from.y, a.x - a.from.x)
  const k = Math.min(1, a.age / 0.06)
  const x = a.from.x + (a.x - a.from.x) * (0.55 + 0.45 * k)
  const y = a.from.y + (a.y - a.from.y) * (0.55 + 0.45 * k)
  ctx.globalAlpha = fadeOut(a, 0.2)
  for (let i = -1; i <= 1; i++) thickLine(ctx, x - Math.cos(ang) * 14 - Math.sin(ang) * i * 4, y - Math.sin(ang) * 14 + Math.cos(ang) * i * 4, x - Math.cos(ang) * (26 - Math.abs(i) * 6) - Math.sin(ang) * i * 4, y - Math.sin(ang) * (26 - Math.abs(i) * 6) + Math.cos(ang) * i * 4, 1, i === 0 ? '#ffffff' : '#f8d030')
  blitRotated(ctx, VERB_FX.bigFist(), x, y, ang, 2)
  if (a.age >= 0.04) {
    const e = Math.min(1, (a.age - 0.04) / 0.25)
    spokes(ctx, a.x, a.y, 6 + e * 6, 14 + e * 12, 10, ['#ffffff', '#f8d030', '#f87040'], t * 2)
  }
  ctx.globalAlpha = 1
}

/** Focus Punch's shockwave ring. */
const drawFocusShock = (ctx: Ctx, a: Attack) => {
  ctx.globalAlpha = fadeOut(a, 0.18)
  dashedRing(ctx, a.x, a.y, radiusOf(a), a.age * 20, ['#ffffff', '#f8d030', '#c03028'], 0.75, 0.7)
  ctx.globalAlpha = 1
}

/** Gyro Ball's gear: spinning faster and throwing sparks the harder it grinds. */
const drawGear = (ctx: Ctx, g: Game, a: Attack, t: number) => {
  const p = ownerOf(g, a.owner)
  const grind = gyroMult(Math.hypot(p.vx, p.vy))
  const frames = VERB_FX.gear()
  const r = radiusOf(a)
  const frame = frames[Math.floor(t * (8 + grind * 10) + a.id) % frames.length]!
  blitCentered(ctx, frame, a.x, a.y)
  if (grind > 1.3) {
    const m = a.motion
    const back = m.kind === 'orbit' ? m.angle - Math.PI / 2 * Math.sign(m.spin || 1) : 0
    for (let i = 0; i < 4; i++) {
      const ph = (t * 6 + hash2(a.id, i)) % 1
      const ang = back + (hash2(a.id, i, Math.floor(t * 6)) - 0.5) * 1.2
      px(ctx, a.x + Math.cos(ang) * (r + ph * 8), a.y + Math.sin(ang) * (r + ph * 8) + ph * 4, i % 2 ? '#ffffff' : '#f8d860')
    }
  }
}

/** Sucker Punch: a shadow darting from the player to the foe, the dark fist and a burst. */
const drawSuckerPunch = (ctx: Ctx, a: Attack) => {
  const ang = Math.atan2(a.y - a.from.y, a.x - a.from.x)
  if (a.age < 0.08) {
    ctx.globalAlpha = 0.7
    thickLine(ctx, a.from.x, a.from.y, a.x, a.y, 3, '#281828')
    thickLine(ctx, a.from.x, a.from.y, a.x, a.y, 1, '#6a5068')
    ctx.globalAlpha = 1
  }
  ctx.globalAlpha = fadeOut(a, 0.12)
  const back = Math.max(0, 1 - a.age / 0.06) * 6
  blitRotated(ctx, VERB_FX.shadowFist(), a.x - Math.cos(ang) * (4 + back), a.y - Math.sin(ang) * (4 + back), ang)
  const e = Math.min(1, a.age / 0.18)
  spokes(ctx, a.x, a.y, 3 + e * 3, 7 + e * 6, 8, ['#ffffff', '#c8b8d8', '#382838'], a.flip ? 0.4 : 0)
  ctx.globalAlpha = 1
}

/** Future Sight's column of psychic light crashing down. */
const drawFutureColumn = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const e = a.age / a.ttl
  const w = Math.max(2, Math.round(r * 0.9 * (1 - e * 0.7)))
  const top = a.y - 260
  ctx.globalAlpha = Math.max(0, 1 - e * e)
  px(ctx, a.x - w, top, '#c03878', w * 2 + 1, a.y - top)
  px(ctx, a.x - w + 1, top, '#f878b0', w * 2 - 1, a.y - top)
  px(ctx, a.x - Math.round(w * 0.55), top, '#ffc0dc', Math.round(w * 1.1) + 1, a.y - top)
  px(ctx, a.x - Math.round(w * 0.2), top, '#ffffff', Math.max(1, Math.round(w * 0.4)) + 1, a.y - top)
  if (a.age < 0.07) blitEllipse(ctx, Math.round(r * 1.2), Math.round(r * 0.6), 'rgba(255,255,255,0.8)', a.x, a.y)
  blitEllipse(ctx, Math.round(r * (0.6 + e * 0.6)), Math.max(1, Math.round(r * 0.3 * (0.6 + e * 0.6))), '#f878b0', a.x, a.y)
  dashedRing(ctx, a.x, a.y, r * (0.8 + e * 0.8), t * 4 + a.id, ['#ffd0e8', '#f85888', '#ffffff'], 0.7, 0.45)
  ctx.globalAlpha = 1
}

/** Stealth Rock: a pointed stone rising out of the ground, then bobbing; blinking before it crumbles. */
const drawStone = (ctx: Ctx, a: Attack, t: number) => {
  const rise = Math.min(1, a.age / 0.2)
  const dying = a.ttl - a.age < 1.2 && Math.floor(a.age * 10) % 2 === 0
  const stones = VERB_FX.stones()
  const bob = Math.round(Math.sin(t * 2.5 + a.id) * 1.5)
  ctx.globalAlpha = dying ? 0.45 : 1
  blitCentered(ctx, stones[a.flip ? 1 : 0]!, a.x, a.y - 4 - Math.round(rise * 6) + bob)
  if ((Math.floor(t * 1.5) + a.id) % 7 === 0 && Math.floor(t * 12) % 2 === 0) px(ctx, a.x - 1, a.y - 13 + bob, '#ffffff')
  ctx.globalAlpha = 1
}

/** U-turn: speed lines along the path in bug greens, a leading crescent while it moves. */
const drawUTurn = (ctx: Ctx, a: Attack) => {
  const dx = a.x - a.from.x
  const dy = a.y - a.from.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const ux = dx / len
  const uy = dy / len
  const colors = ['#ffffff', '#e0f080', '#a8b820']
  ctx.globalAlpha = fadeOut(a, 0.14)
  for (let lane = -2; lane <= 2; lane++) {
    ctx.fillStyle = colors[Math.abs(lane)]!
    for (let d = Math.abs(lane) * 5; d < len; d += 1) ctx.fillRect(Math.round(a.from.x + ux * d - uy * lane * 3), Math.round(a.from.y + uy * d + ux * lane * 3), 1, 1)
  }
  if (a.motion.kind === 'lunge' && a.motion.left > 0) {
    const r = radiusOf(a)
    const dir = Math.atan2(uy, ux)
    for (let i = -8; i <= 8; i++) {
      const ang = dir + i * 0.14
      for (let k = 0; k < 3 - Math.abs(i) / 4; k++) px(ctx, a.x + Math.cos(ang) * (r - k), a.y + Math.sin(ang) * (r - k), colors[k]!)
    }
    // Wings buzzing on the dash.
    const wing = Math.floor(a.age * 60) % 2
    for (const s of [-1, 1]) px(ctx, a.x - ux * 4 - uy * s * (5 + wing), a.y - uy * 4 + ux * s * (5 + wing) - 4, 'rgba(232,248,200,0.8)', 3, 2)
  }
  ctx.globalAlpha = 1
}

/** Dragon Tail: a scaled crescent swept from the start of the arc to where the tail is now. */
const drawDragonTail = (ctx: Ctx, g: Game, a: Attack) => {
  const m = a.motion
  if (m.kind !== 'orbit') return
  const p = ownerOf(g, a.owner)
  const r = radiusOf(a) * 0.8
  const swept = Math.min(TAIL.swing, a.age) * m.spin
  const start = m.angle - swept
  const steps = Math.max(6, Math.ceil(Math.abs(swept) * r * 0.5))
  ctx.globalAlpha = a.age > TAIL.swing ? fadeOut(a, a.ttl - TAIL.swing) : 1
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const ang = start + swept * k
    const thick = 2 + Math.round(k * 5)
    for (let d = 0; d < thick; d++) {
      const rr = r - d
      const c = d === 0 ? (k > 0.55 ? '#ffffff' : '#d8c8ff') : d === thick - 1 ? '#200868' : (i + d) % 4 === 0 ? '#b898ff' : (i + d) % 2 === 0 ? '#9070ff' : '#7038f8'
      px(ctx, p.x + Math.cos(ang) * rr, p.y - 8 + Math.sin(ang) * rr * 0.75, c, 2, 2)
    }
  }
  // Whoosh lines outside the arc.
  for (let i = 0; i < 3; i++) {
    const ang = start + swept * (0.5 + i * 0.2)
    px(ctx, p.x + Math.cos(ang) * (r + 4 + i), p.y - 8 + Math.sin(ang) * (r + 4 + i) * 0.75, '#ffffff')
  }
  // The spade tip at the leading end.
  const tipX = p.x + Math.cos(m.angle) * r
  const tipY = p.y - 8 + Math.sin(m.angle) * r * 0.75
  px(ctx, tipX - 3, tipY - 3, '#200868', 7, 7)
  px(ctx, tipX - 2, tipY - 2, '#9070ff', 5, 5)
  px(ctx, tipX - 1, tipY - 1, '#d8c8ff', 3, 3)
  px(ctx, tipX, tipY, '#ffffff')
  ctx.globalAlpha = 1
}

/** Sheer Cold's ring: ice crystals on a white rim spreading out. */
const drawSheerColdRing = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  ctx.globalAlpha = Math.max(0, 1 - k * k)
  dashedRing(ctx, a.x, a.y, r, t * 3, ['#ffffff', '#d8f0ff', '#98d8f8'], 0.85, 0.5)
  const crystal = VERB_FX.crystal()
  const n = Math.max(6, Math.round(r / 9))
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + a.id * 0.3
    blitCentered(ctx, crystal, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r * 0.5 - 4)
  }
  ctx.globalAlpha = 1
}

/** Over `g`'s player, from their own moves: Focus Punch's charge, Roost's feathers. */
export const drawVerbPlayerAir = (ctx: Ctx, g: Game, t: number) => {
  drawFocusAura(ctx, g, t)
  drawRoostAir(ctx, g, t)
}

/** Air layer (over the Pokémon). */
export const drawVerbAir = (ctx: Ctx, g: Game, t: number, visible: (x: number, y: number, m?: number) => boolean) => {
  drawSolarBeams(ctx, g, t)
  for (const a of g.attacks) {
    if (a.age < 0 || !visible(a.x, a.y, 200)) continue
    switch (a.visual) {
      case 'solarCharge':
        drawSolarCharge(ctx, g, a, t)
        break
      case 'brine':
        drawBrine(ctx, a)
        break
      case 'electroBall':
        drawElectroBall(ctx, a, t)
        break
      case 'venoshock':
        drawGlob(ctx, a, t)
        break
      case 'selfDestruct':
        drawSelfDestruct(ctx, a, t)
        break
      case 'roostGust':
        drawRoostGust(ctx, a)
        break
      case 'focusPunch':
        drawFocusPunch(ctx, a, t)
        break
      case 'focusShock':
        drawFocusShock(ctx, a)
        break
      case 'gyroBall':
        drawGear(ctx, g, a, t)
        break
      case 'suckerPunch':
        drawSuckerPunch(ctx, a)
        break
      case 'futureSight':
        drawFutureColumn(ctx, a, t)
        break
      case 'bone':
        blitRotated(ctx, VERB_FX.bone(), a.x, a.y, a.age * 20, Math.max(1, Math.round(radiusOf(a) / 7)))
        break
      case 'stealthRock':
        drawStone(ctx, a, t)
        break
      case 'uTurn':
        drawUTurn(ctx, a)
        break
      case 'dragonTail':
        drawDragonTail(ctx, g, a)
        break
      case 'sheerCold':
        drawSheerColdRing(ctx, a, t)
        break
    }
  }
}
