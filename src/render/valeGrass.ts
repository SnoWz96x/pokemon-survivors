import { canvasCache, context2d, createCanvas, type PixelSprite } from '../engine/pixelart'
import { hash2 } from '../engine/rng'
import { VALE, type Rect } from '../data/versus'
import { patchAt } from '../game/versusGrass'
import type { Player } from '../game/types'

/**
 * The Arena's tall grass on screen, draw-only (`game/versusGrass.ts` hides
 * who stands in it): each patch as code-authored pixel blades that sway, a
 * row of blades over the lower body of whoever stands in one (the viewer's
 * team see-through, more while hidden), leaves flicking off a Pokémon walking
 * through, and the rule that a rival hidden there isn't drawn at all
 * (`concealed`). The art lives in `bakePatch` and `bakeFront` alone, so a
 * painted pass can replace it.
 */

type Ctx = CanvasRenderingContext2D

/** How far blades rise over their roots (px), and the sway frames. */
const TALL = 11
const FRAMES = 4
/** Sway frames per second. */
const FPS = 3

const C = { root: '#1e4a20', dark: '#2a5e28', mid: '#3c7c34', light: '#5a9e44', tip: '#8cc858', shade: 'rgba(10,30,12,0.38)' } as const

/** A blade's tip shift (px) in sway frame `f` for column `col`: a wave running across the patch. */
const sway = (f: number, col: number) => [0, 1, 0, -1][(f + Math.floor(col / 5)) % FRAMES]!

/** One blade rooted at (x, y) in `ctx`, `h` px tall, its top third leaning `lean` px. */
const blade = (ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lean: number, front: boolean) => {
  for (let k = 0; k < h; k++) {
    const up = k / h
    const dx = up > 0.62 ? lean : 0
    ctx.fillStyle = up < 0.2 ? C.root : up < 0.5 ? C.dark : up < 0.8 ? (front ? C.light : C.mid) : front ? C.tip : C.light
    ctx.fillRect(x + dx, y - k, 1, 1)
  }
}

/** How far row `y` (0 the top) of a `w`×`h` patch steps in from its sides: its corners are round. */
const inset = (y: number, h: number, w: number) => {
  const r = Math.min(10, h / 2, w / 2)
  const d = Math.min(y, h - 1 - y)
  return d >= r ? 0 : Math.ceil(r - Math.sqrt(r * r - (r - d) * (r - d)))
}

/**
 * Patch `i` in sway frame `f`, its canvas `TALL` px taller than the patch so
 * the back row's blades rise over its top edge: a shaded bed with round
 * corners, then rows of blades from the back to the front.
 */
const bakePatch = (r: Rect, i: number, f: number) => {
  const w = r.x1 - r.x0
  const h = r.y1 - r.y0
  const canvas = createCanvas(w, h + TALL)
  const ctx = context2d(canvas)
  for (let y = 0; y < h; y++) {
    const k = inset(y, h, w)
    ctx.fillStyle = C.shade
    ctx.fillRect(k, TALL + y, w - 2 * k, 1)
    ctx.fillStyle = C.root
    if (y > 0 && y < h - 1) ctx.fillRect(k + 2, TALL + y, w - 2 * k - 4, 1)
  }
  for (let row = 0; row * 3 < h - 1; row++) {
    const y = 2 + row * 3
    const front = y > h - 6
    const k = inset(y, h, w) + 1
    for (let col = k + (row % 2); col < w - k; col += 2) {
      const tall = 5 + Math.floor(hash2(col + i * 97, row, 61) * (TALL - 4))
      blade(ctx, col, TALL + y, tall, sway(f, col + row), front)
    }
  }
  return canvas
}

/** A row of blades `w` px wide (sway frame `f`): what stands in front of a Pokémon's lower body in the grass. */
const bakeFront = (w: number, f: number) => {
  const canvas = createCanvas(w, TALL)
  const ctx = context2d(canvas)
  for (let col = 0; col < w; col++) {
    const edge = Math.min(col, w - 1 - col)
    const tall = Math.max(3, Math.min(TALL - 2, 6 + Math.floor(hash2(col, w, 62) * 4) - Math.max(0, 3 - edge)))
    blade(ctx, col, TALL - 1, tall, sway(f, col), true)
  }
  return canvas
}

const patches = canvasCache<string, PixelSprite>()
const fronts = canvasCache<string, PixelSprite>()

const frameAt = (t: number, seed: number) => Math.floor(t * FPS + seed * 0.37) % FRAMES

/** Every patch in view (`visible`), swaying: on the ground, under the Pokémon. */
export const drawGrassPatches = (ctx: Ctx, t: number, visible: (x: number, y: number, m?: number) => boolean) => {
  VALE.grass.forEach((r, i) => {
    if (!visible((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 80)) return
    const f = frameAt(t, i)
    const key = `${i}:${f}`
    let s = patches.get(key)
    if (!s) patches.set(key, (s = bakePatch(r, i, f)))
    ctx.drawImage(s, r.x0, r.y0 - TALL)
  })
}

/** Whether `p` is hidden from `viewer`: a rival in tall grass the viewer's team can't see. Drawn nowhere. */
export const concealed = (viewer: Player, p: Player) => p.versus?.hidden === true && viewer.versus !== undefined && p.versus.team !== viewer.versus.team

/**
 * How see-through `p` draws for `viewer` (1 opaque): in the grass, a
 * Pokémon of the viewer's team (themselves too) shows faint while hidden and
 * half-faint once a rival sees it; a rival drawn there is in plain sight.
 */
export const grassAlpha = (viewer: Player | null, p: Player) => {
  const v = p.versus
  if (!v || !viewer?.versus || v.team !== viewer.versus.team || patchAt(p.x, p.y) < 0) return 1
  return v.hidden ? 0.5 : 0.8
}

/**
 * Over the lower body of a Pokémon in the grass (feet at x, y; `bodyW` its
 * width): a row of blades, cut to its patch's sides; walking (`moving`), they
 * shake and leaves flick off them. Nothing outside the grass.
 */
export const drawGrassFront = (ctx: Ctx, x: number, y: number, bodyW: number, t: number, moving: boolean, seed: number) => {
  const i = patchAt(x, y)
  if (i < 0) return
  const r = VALE.grass[i]!
  const w = Math.max(14, Math.round(bodyW) + 8)
  const f = moving ? Math.floor(t * 12 + seed) % FRAMES : frameAt(t, i)
  const key = `${w}:${f}`
  let s = fronts.get(key)
  if (!s) fronts.set(key, (s = bakeFront(w, f)))
  const left = Math.round(x - w / 2)
  const top = Math.round(y + 2 - TALL)
  const from = Math.max(left, r.x0)
  const to = Math.min(left + w, r.x1)
  if (to > from) ctx.drawImage(s, from - left, 0, to - from, TALL, from, top, to - from, TALL)
  if (moving) rustle(ctx, x, top, w, t, seed)
}

/** Leaves flicking up off the blades a Pokémon walks through. */
const rustle = (ctx: Ctx, x: number, top: number, w: number, t: number, seed: number) => {
  const beat = Math.floor(t * 10)
  for (let k = 0; k < 3; k++) {
    const life = (t * 2.5 + k / 3 + seed * 0.13) % 1
    const dx = (hash2(beat - Math.floor(life * 10), k, 63 + seed) - 0.5) * w
    ctx.fillStyle = k === 1 ? C.tip : C.light
    ctx.fillRect(Math.round(x + dx + life * (k - 1) * 4), Math.round(top + 2 - life * 9), life < 0.5 ? 2 : 1, 1)
  }
}
