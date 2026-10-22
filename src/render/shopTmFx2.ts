import { blitCentered, blitEllipse, blitRotated, lazy, type PixelSprite } from '../engine/pixelart'
import { TAU } from '../engine/math'
import { hash2 } from '../engine/rng'
import { FLY, type ShopTmMove2Id } from '../game/shopTmMoves2'
import type { Attack, Game } from '../game/types'
import { ownAttack, ownerOf } from '../game/players'
import { px, sprite, thickLine } from './shopTmFx'
import { dashedRing } from './strokes'

/**
 * Art of the shop-exclusive TMs' second batch (`game/shopTmMoves2.ts`): the
 * little rain cloud and sun over the player while their sky is called, the
 * raindrops and sunbeams that fall from them, Swords Dance's whirling swords
 * (and its stacks over the head), Drain Punch's fist, Thunder Wave's front
 * and Fly's lift and landing. `draw.ts` calls `drawShopTm2Ground` under the
 * Pokémon, `drawShopTm2Air` over them, `drawShopTm2Player` over the player,
 * and lifts the player with `shopTm2PlayerLook`. Whole pixels only; flicker
 * comes from `hash2` and the clock, never Math.random.
 */

type Ctx = CanvasRenderingContext2D

const radiusOf = (a: Attack) => (a.shape.kind === 'circle' ? a.shape.r : 8)

/* ---------------- Sprites ---------------- */

const RAIN = { 1: '#28487a', 2: '#f0f4fc', 3: '#a8b8d8', 4: '#6890f0' } as const
const SUN = { 1: '#c86010', 2: '#f8a030', 3: '#f8d030', 4: '#fff8c0' } as const
const BLADE = { 1: '#ffffff', 2: '#c8d0e0', 3: '#f8c830', 4: '#985828' } as const

/** A sword pointing right (it spins with its angle). */
const SWORD = lazy(() => sprite(['...3.........', '44.32222222..', '4443111111112', '44.32222222..', '...3.........'], BLADE))

/** Drain Punch's glove, punching right. */
const FIST = lazy(() =>
  sprite(['..1111....', '.122321...', '1232232111', '1222322231', '1223222221', '1222222221', '.12222221.', '..111111..'], { 1: '#701010', 2: '#d83828', 3: '#ffa088' }),
)

/** The little rain cloud and sun over the player. */
const CLOUD = lazy(() => sprite(['..1111...', '.122221..', '12222221.', '133333331', '.1111111.'], RAIN))
const SUN_DISC = lazy(() => sprite(['..111..', '.13331.', '1334331', '1344431', '1334331', '.13331.', '..111..'], SUN))

/* ---------------- Icons ---------------- */

export const SHOP_TM_ICONS_2: Record<ShopTmMove2Id, () => PixelSprite> = {
  rainDance: () => sprite(['..1111...', '.122221..', '12222221.', '133333331', '.1111111.', '..4..4...', '.4..4..4.', '...4..4..'], RAIN),
  sunnyDay: () => sprite(['....2....', '.2.....2.', '...111...', '..13331..', '2.13431.2', '..13331..', '...111...', '.2.....2.', '....2....'], SUN),
  swordsDance: () => sprite(['2.......2', '12.....21', '.12...21.', '..12.21..', '...121...', '..3.2.3..', '.3.....3.', '4.......4'], BLADE),
  drainPunch: () =>
    sprite(['4.......4', '..1111...', '.122321..', '12322231.', '12222221.', '12222221.', '.111111..', '...4..4..'], { 1: '#701010', 2: '#d83828', 3: '#ffa088', 4: '#78f878' }),
  thunderWave: () =>
    sprite(['3....11..', '.3..121..', '3..121...', '..12221..', '3.11121..', '.3..121.3', '3..121.3.', '...11...3'], { 1: '#806000', 2: '#f8e030', 3: '#fff8a0' }),
  fly: () => sprite(['1........', '12.......', '122......', '1222.....', '12322....', '.123322..', '..1233321', '...111111'], { 1: '#506080', 2: '#f8f8ff', 3: '#c8d0e0' }),
}

/* ---------------- On the ground ---------------- */

/** Sunny Day's sun-lit ring around the player: a warm disc with a turning golden rim. */
const drawSunRing = (ctx: Ctx, a: Attack, t: number) => {
  const r = Math.round(radiusOf(a))
  const fade = Math.min(1, a.age / 0.4, (a.ttl - a.age) / 0.6)
  if (fade <= 0) return
  ctx.globalAlpha = fade
  blitEllipse(ctx, r, Math.max(1, Math.round(r * 0.5)), 'rgba(248,200,64,0.14)', a.x, a.y)
  dashedRing(ctx, a.x, a.y, r, t * 1.5, ['#fff3a0', '#f8b030'], 0.55, 0.5)
  ctx.globalAlpha = 1
}

/** Fly's landing: a dust ring and a white shockwave spreading on the ground. */
const drawSlamGround = (ctx: Ctx, a: Attack) => {
  const r = Math.round(radiusOf(a))
  const k = a.age / a.ttl
  ctx.globalAlpha = Math.max(0, 1 - k)
  blitEllipse(ctx, r, Math.max(1, Math.round(r * 0.5)), 'rgba(160,128,96,0.35)', a.x, a.y)
  dashedRing(ctx, a.x, a.y, r, 0, ['#ffffff', '#d8e0f0'], 0.8, 0.5)
  ctx.globalAlpha = 1
}

/** The second batch's ground pass (`draw.ts`, under the Pokémon). */
export const drawShopTm2Ground = (ctx: Ctx, g: Game, t: number) => {
  for (const a of g.attacks) {
    if (a.age < 0) continue
    if (a.visual === 'sunnyDay') drawSunRing(ctx, a, t)
    else if (a.visual === 'flySlam') drawSlamGround(ctx, a)
  }
}

/* ---------------- In the air ---------------- */

/** A raindrop falling onto its warning ring (the telegraph's life is the fall). */
const drawFallingDrop = (ctx: Ctx, a: Attack) => {
  const k = Math.min(1, a.age / a.ttl)
  const y = a.y - (1 - k) * 70
  thickLine(ctx, a.x, y - 6, a.x, y, 2, '#a8c8f8')
  px(ctx, a.x - 1, y - 1, '#6890f0', 3, 3)
  px(ctx, a.x, y - 1, '#ffffff')
}

/** A sunbeam narrowing down onto its warning ring. */
const drawFallingBeam = (ctx: Ctx, a: Attack) => {
  const k = Math.min(1, a.age / a.ttl)
  const w = Math.max(1, Math.round(1 + k * 3))
  ctx.globalAlpha = 0.35 + 0.5 * k
  thickLine(ctx, a.x, a.y - 90, a.x, a.y, w, '#fff3a0')
  ctx.globalAlpha = 1
}

/** The drop's splash: a ring of droplets thrown out and falling. */
const drawSplash = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  blitEllipse(ctx, Math.max(1, Math.round(r * (0.5 + k))), Math.max(1, Math.round(r * (0.25 + k * 0.5))), `rgba(104,144,240,${(0.5 * (1 - k)).toFixed(2)})`, a.x, a.y + r * 0.5)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + hash2(a.id, i)
    const d = r * (0.4 + k * 1.1)
    const lift = Math.sin(k * Math.PI) * 8
    px(ctx, a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d * 0.5 - lift, i % 2 ? '#ffffff' : '#a8c8f8', 2, 2)
  }
}

/** The sunbeam's impact: a bright column with a white core and a flare at its foot. */
const drawBeam = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  const w = Math.max(2, Math.round(r * 0.9 * (1 - k)))
  ctx.globalAlpha = Math.max(0, 1 - k)
  thickLine(ctx, a.x, a.y - 100, a.x, a.y, w + 2, 'rgba(248,160,48,0.6)')
  thickLine(ctx, a.x, a.y - 100, a.x, a.y, w, '#fff3a0')
  thickLine(ctx, a.x, a.y - 100, a.x, a.y, Math.max(1, w - 3), '#ffffff')
  blitEllipse(ctx, Math.round(r), Math.max(1, Math.round(r * 0.5)), 'rgba(255,248,192,0.7)', a.x, a.y + 2)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + t * 4
    px(ctx, a.x + Math.cos(ang) * (r + 2), a.y + 2 + Math.sin(ang) * (r + 2) * 0.5, '#fff8c0')
  }
  ctx.globalAlpha = 1
}

/** A whirling sword, pointing out from the player, with a short white arc behind it. */
const drawSword = (ctx: Ctx, a: Attack) => {
  const m = a.motion
  if (m.kind !== 'orbit') return
  const fade = Math.min(1, (a.ttl - a.age) / 0.15)
  ctx.globalAlpha = fade
  for (let i = 1; i <= 3; i++) {
    const back = m.angle - Math.sign(m.spin) * i * 0.12
    const cx = a.x - Math.cos(m.angle) * m.radius + Math.cos(back) * m.radius
    const cy = a.y - Math.sin(m.angle) * m.radius + Math.sin(back) * m.radius
    px(ctx, cx, cy, i === 1 ? '#ffffff' : '#c8d0e0')
  }
  blitRotated(ctx, SWORD(), a.x, a.y, m.angle)
  ctx.globalAlpha = 1
}

/** Drain Punch: the glove thrusts out, a white star where it lands, green motes drawn back to the player. */
const drawPunch = (ctx: Ctx, a: Attack, g: Game) => {
  const k = a.age / a.ttl
  const out = Math.min(1, a.age / 0.08)
  const dx = Math.cos(a.memo)
  const dy = Math.sin(a.memo)
  const x = a.x - dx * (1 - out) * 8
  const y = a.y - dy * (1 - out) * 8
  ctx.globalAlpha = Math.min(1, (a.ttl - a.age) / 0.1)
  // The drain's green glow around the glove.
  blitEllipse(ctx, 9, 7, 'rgba(120,248,120,0.35)', x, y)
  blitRotated(ctx, FIST(), x, y, a.memo)
  if (a.age < 0.12) {
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + 0.4
      thickLine(ctx, x + dx * 6, y + dy * 6, x + dx * 6 + Math.cos(ang) * 5, y + dy * 6 + Math.sin(ang) * 5, 1, '#ffffff')
    }
  }
  if (a.hits.size > 0) {
    const p = ownerOf(g, a.owner)
    for (let i = 0; i < 5; i++) {
      const f = (k + i / 5) % 1
      px(ctx, x + (p.x - x) * f, y + (p.y - 12 - y) * f - Math.sin(f * Math.PI) * 6, i % 2 ? '#78f878' : '#d8f8c8', 2, 2)
    }
  }
  ctx.globalAlpha = 1
}

/** One spark of Thunder Wave's front: a jagged yellow arc across its way, flickering. */
const drawWave = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  const nx = -Math.sin(a.memo)
  const ny = Math.cos(a.memo)
  ctx.globalAlpha = Math.max(0, 1 - k * k)
  let x0 = a.x - nx * r
  let y0 = a.y - ny * r
  const steps = 4
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    const jag = (hash2(a.id, i + Math.floor(t * 20)) - 0.5) * 5
    const x1 = a.x + nx * r * (2 * f - 1) + Math.cos(a.memo) * jag
    const y1 = a.y + ny * r * (2 * f - 1) + Math.sin(a.memo) * jag
    thickLine(ctx, x0, y0, x1, y1, 2, '#f8d030')
    thickLine(ctx, x0, y0, x1, y1, 1, '#fff8c0')
    x0 = x1
    y0 = y1
  }
  if (hash2(a.id, Math.floor(t * 12)) > 0.6) px(ctx, a.x + Math.cos(a.memo) * 3, a.y + Math.sin(a.memo) * 3, '#ffffff', 2, 2)
  ctx.globalAlpha = 1
}

/** The second batch's pass over the Pokémon (`draw.ts`). */
export const drawShopTm2Air = (ctx: Ctx, g: Game, t: number, visible: (x: number, y: number, m?: number) => boolean) => {
  for (const a of g.attacks) {
    if (a.age < 0 || !visible(a.x, a.y, 120)) continue
    switch (a.visual) {
      case 'telegraph':
        if (a.move === 'rainDance') drawFallingDrop(ctx, a)
        else if (a.move === 'sunnyDay') drawFallingBeam(ctx, a)
        break
      case 'rainDrop':
        drawSplash(ctx, a)
        break
      case 'sunBeam':
        drawBeam(ctx, a, t)
        break
      case 'swordsDance':
        drawSword(ctx, a)
        break
      case 'drainPunch':
        drawPunch(ctx, a, g)
        break
      case 'thunderWave':
        drawWave(ctx, a, t)
        break
    }
  }
}

/* ---------------- On the player ---------------- */

/** How high Fly has the player now (0 on the ground): a quick climb, a hover, a dive. */
export const flyLift = (g: Game) => {
  if (g.player.hidden?.move !== 'fly') return 0
  const a = g.attacks.find((x) => x.visual === 'flyLift' && x.age >= 0 && x.age < x.ttl && ownAttack(g, x))
  if (!a) return 0
  const k = a.age / a.ttl
  return Math.round(FLY.lift * Math.min(1, Math.sin(k * Math.PI) * 1.6))
}

/** The player's sprite while flying: lifted, fully seen (out of reach, not hidden). Null on the ground. */
export const shopTm2PlayerLook = (g: Game) => (g.player.hidden?.move === 'fly' ? { lift: flyLift(g), alpha: 1 } : null)

/**
 * Over the player: the rain cloud or the sun of a called sky above the head
 * (the cloud drizzles), and Swords Dance's stacks as little swords circling
 * the head while its might holds.
 */
export const drawShopTm2Player = (ctx: Ctx, g: Game, t: number, head: number) => {
  const p = g.player
  const top = head - flyLift(g)
  for (const a of g.attacks) {
    if (a.age < 0 || a.age >= a.ttl || !ownAttack(g, a)) continue
    if (a.visual === 'rainDance') {
      const y = top - 8 + Math.round(Math.sin(t * 2) * 1)
      blitCentered(ctx, CLOUD(), p.x, y)
      for (let i = 0; i < 3; i++) {
        const f = (t * 2.2 + i / 3) % 1
        px(ctx, p.x - 3 + i * 3, y + 3 + f * 9, '#6890f0', 1, 2)
      }
    } else if (a.visual === 'sunnyDay') {
      const y = top - 9
      blitCentered(ctx, SUN_DISC(), p.x, y)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU + t * 1.2
        px(ctx, p.x + Math.cos(ang) * 7, y + Math.sin(ang) * 7, i % 2 ? '#f8a030' : '#fff3a0')
      }
    }
  }
  const owned = p.moves.find((m) => m.id === 'swordsDance')
  if (owned && p.moveBuffs.some((b) => b.move === 'swordsDance')) {
    const stacks = owned.stacks ?? 0
    for (let i = 0; i < stacks; i++) {
      const ang = t * 3 + (i * TAU) / stacks
      const x = p.x + Math.cos(ang) * 10
      const y = top - 2 + Math.sin(ang) * 3
      thickLine(ctx, x, y - 3, x, y + 1, 1, '#e8f0ff')
      px(ctx, x - 1, y + 1, '#f8c830', 3, 1)
    }
  }
}
