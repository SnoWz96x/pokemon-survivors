import { blitCentered, blitEllipse, fromStrings, lazy } from '../engine/pixelart'
import { TYPE_COLORS } from '../data/types'
import { MOVES, type MoveDef } from '../game/moves'
import type { Attack, Enemy, Game } from '../game/types'
import { dashedRing } from './strokes'
import { localPlayer } from '../game/players'

/**
 * Drawing for the move kit (`game/moveKit.ts`): delayed-strike telegraphs,
 * the over-the-head marks of the newer conditions (mark, confuse, seed,
 * freeze) and the player's guard bubble. Everything snaps to whole pixels.
 */

type Ctx = CanvasRenderingContext2D

const px = (ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) => {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

/**
 * A delayed strike's warning: a dashed rim in the move's color around a
 * shadow that fills in as the hit comes, blinking white just before it lands.
 */
export const drawTelegraph = (ctx: Ctx, a: Attack) => {
  if (a.shape.kind !== 'circle') return
  const r = a.shape.r
  const k = Math.min(1, a.age / a.ttl)
  const color = TYPE_COLORS[a.type]
  const late = k > 0.8 && Math.floor(a.age * 30) % 2 === 0
  blitEllipse(ctx, Math.round(r), Math.max(1, Math.round(r * 0.5)), 'rgba(16,8,24,0.18)', a.x, a.y)
  const inner = Math.max(1, Math.round(r * k))
  blitEllipse(ctx, inner, Math.max(1, Math.round(inner * 0.5)), late ? 'rgba(255,255,255,0.55)' : `${color}66`, a.x, a.y)
  dashedRing(ctx, a.x, a.y, r, a.age * 6, late ? ['#ffffff'] : [color, '#ffffff'], 0.75, 0.5)
}

const SPROUT = lazy(() =>
  fromStrings(['.k...k.', 'kGk.kGk', 'kGGkGGk', '.kgGgk.', '..kgk..', '...k...'], { k: '#183818', G: '#98e060', g: '#48a030' }),
)
const STAR = lazy(() => fromStrings(['.y.', 'yWy', '.y.'], { y: '#f8d030', W: '#ffffff' }))

/** Corner brackets around a marked foe's body, closing in a little on each beat, and one pip per stack above. */
const drawMark = (ctx: Ctx, e: Enemy, cy: number, t: number) => {
  const beat = Math.floor(t * 4 + e.id) % 4 === 0 ? 1 : 0
  const s = Math.round(e.radius + 3 - beat)
  const c = '#f83848'
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = Math.round(e.x + sx * s)
    const y = Math.round(cy + sy * s)
    px(ctx, sx < 0 ? x : x - 2, y, c, 3, 1)
    px(ctx, x, sy < 0 ? y : y - 2, c, 1, 3)
  }
  const stacks = e.status.mark.stacks
  const top = Math.round(cy - s - 4)
  for (let i = 0; i < stacks; i++) {
    const x = Math.round(e.x - (stacks * 4 - 1) / 2 + i * 4)
    px(ctx, x - 1, top - 1, '#381018', 4, 4)
    px(ctx, x, top, '#f85868', 2, 2)
  }
}

/** A frozen foe sits in a pale ice block with a bright rim and a glint. */
const drawIce = (ctx: Ctx, e: Enemy, cy: number) => {
  const w = Math.round(e.radius * 2 + 4)
  const h = Math.round(e.radius * 2.4 + 4)
  const x = Math.round(e.x - w / 2)
  const y = Math.round(cy - h / 2 - 1)
  ctx.fillStyle = 'rgba(200,240,255,0.32)'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#e0f8ff'
  ctx.fillRect(x, y, w, 1)
  ctx.fillRect(x, y + h - 1, w, 1)
  ctx.fillRect(x, y, 1, h)
  ctx.fillRect(x + w - 1, y, 1, h)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x + 2, y + 2, 1, Math.max(2, Math.round(h * 0.35)))
  ctx.fillRect(x + 3, y + 2, 2, 1)
}

/**
 * The newer conditions' marks over every afflicted foe on screen: mark
 * brackets, confusion stars circling the head, a leech sprout, an ice block.
 * (Burn, poison and paralysis show through tint and particles, sleep through its Zs.)
 */
export const drawKitStatus = (ctx: Ctx, g: Game, t: number, visible: (x: number, y: number) => boolean) => {
  for (const e of g.enemies) {
    const st = e.status
    if (e.dying >= 0 || !visible(e.x, e.y)) continue
    if (st.freeze.time <= 0 && st.mark.time <= 0 && st.confuse.time <= 0 && st.seed.time <= 0) continue
    const cy = e.y - e.radius
    const head = e.y - e.radius * 2.4
    // Roar of Time stops time and Telekinesis holds the foe instead of icing over (`legendaryFx.ts`, `legendaryFx2.ts` draw them).
    if (st.freeze.time > 0 && st.freeze.move !== 'roarOfTime' && st.freeze.move !== 'telekinesis') drawIce(ctx, e, cy)
    if (st.seed.time > 0) blitCentered(ctx, SPROUT(), e.x, head - 2 + (Math.floor(t * 3 + e.id) % 2))
    if (st.confuse.time > 0) {
      for (let k = 0; k < 3; k++) {
        const a = t * 5 + e.id + (k * Math.PI * 2) / 3
        blitCentered(ctx, STAR(), e.x + Math.cos(a) * (e.radius + 2), head - 4 + Math.sin(a) * 2)
      }
    }
    if (st.mark.time > 0) drawMark(ctx, e, cy, t)
  }
}

/** The guard window as a bright bubble around the player, flickering in its last moments. */
export const drawGuard = (ctx: Ctx, g: Game, t: number) => {
  const w = localPlayer(g).guard
  if (!w || (w.left < 0.3 && Math.floor(t * 20) % 2 === 0)) return
  const def: MoveDef = MOVES[w.move]
  const p = localPlayer(g)
  const r = Math.max(14, p.radius + 9)
  dashedRing(ctx, p.x, p.y - 10, r, t * 4, [TYPE_COLORS[def.type], '#ffffff'], 0.9)
  dashedRing(ctx, p.x, p.y - 10, r - 2, -t * 6, ['#ffffff'], 0.3)
}
