import { blitCentered, blitEllipse, blitPacked, canvasCache, context2d, createCanvas, fromStrings, lazy, textSprite, type PixelSprite } from '../engine/pixelart'
import { hash2 } from '../engine/rng'
import { VALE, VERSUS, type Rect, type Team } from '../data/versus'
import { channelTime, goalOpen } from '../game/versusRules'
import type { GoalState, VersusState } from '../game/versus'
import type { Game, Player } from '../game/types'
import { dashedRing } from './strokes'

/**
 * The Vale (Arena, `game/versus.ts`) on screen, draw-only: its floor baked in
 * 256 px tiles of code-authored pixel art (grass, the lanes' worn dirt paths,
 * the darker jungle, the bases' flagstones tinted to their team, a hedge wall
 * around it all), the spawn pads and goal zones on the ground, the Energy
 * orbs, each scorer's channel arc and the goals' points left. `render` calls
 * the passes only while `g.versus` is set.
 */

type Ctx = CanvasRenderingContext2D
type RGB = readonly [number, number, number]

/** Each team's color: Blue (west, 0) and Red (east, 1). */
export const TEAM_COLORS = ['#4890f0', '#f05858'] as const satisfies readonly [string, string]
/** Lighter twins, for text and rims over the dark hedge and the grass. */
export const TEAM_LIGHT = ['#a8d0ff', '#ffb0a8'] as const satisfies readonly [string, string]

export const teamColor = (team: Team) => TEAM_COLORS[team]
export const teamLight = (team: Team) => TEAM_LIGHT[team]

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

/* ---------------- The floor: what stands where ---------------- */

/** Whether the world pixel (x, y) is on the Vale's floor (the union of `VALE.rects`). */
export const onFloor = (x: number, y: number, rects: readonly Rect[] = VALE.rects) => {
  for (const r of rects) if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return true
  return false
}

/** Where the bases begin (|x|), and the lanes' paths (|y|). */
const BASE_X = 540
const LANE_Y = 295
/** The passages' dirt columns, from the lanes into the jungle. */
const PASSAGES = [-350, 0, 350] as const

export type FloorZone = 'base' | 'lane' | 'jungle' | 'passage'

/** Which part of the Vale a floor pixel belongs to. Pure, for the bake (and its test). */
export const zoneAt = (x: number, y: number): FloorZone => {
  if (x < -BASE_X || x >= BASE_X) return 'base'
  if (y < -210 || y >= 210) return 'lane'
  if (x >= -470 && x < 470 && y >= -160 && y < 160) return 'jungle'
  return 'passage'
}

/* ---------------- Noise ---------------- */

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Smooth value noise along a line (0..1), a knot every `step` px. */
const noise1 = (v: number, step: number, seed: number) => {
  const p = v / step
  const i = Math.floor(p)
  const f = smooth(p - i)
  return hash2(i, 0, seed) * (1 - f) + hash2(i + 1, 0, seed) * f
}

/** Smooth value noise over the plane (0..1), a knot every `step` px. */
const noise2 = (x: number, y: number, step: number, seed: number) => {
  const px = x / step
  const py = y / step
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  const fx = smooth(px - ix)
  const fy = smooth(py - iy)
  const a = hash2(ix, iy, seed) * (1 - fx) + hash2(ix + 1, iy, seed) * fx
  const b = hash2(ix, iy + 1, seed) * (1 - fx) + hash2(ix + 1, iy + 1, seed) * fx
  return a * (1 - fy) + b * fy
}

/* ---------------- Palettes ---------------- */

const GRASS = { main: hex('#5ca24a'), alt: hex('#66ac52'), dark: hex('#4a8c3e'), light: hex('#80c262'), tuft: hex('#3e7e36') }
const JUNGLE = { main: hex('#3e7a3a'), alt: hex('#468442'), dark: hex('#30662e'), light: hex('#5a964a'), tuft: hex('#2a5c2a') }
const DIRT = { main: hex('#b48a5a'), alt: hex('#a87e4e'), dark: hex('#8c6a44'), light: hex('#d0ae7e') }
const STONE = { a: hex('#aca89e'), b: hex('#bab6ac'), grout: hex('#6e6c6a'), lit: hex('#d4d0c6') }
const HEDGE = { gap: hex('#0e2a16'), dark: hex('#1a4424'), mid: hex('#245a2e'), light: hex('#34723a'), leaf: hex('#46904a') }
const RIM = [hex('#5c9c4c'), hex('#3c7a3c')] as const
const FACE = [hex('#0c2012'), hex('#163a20'), hex('#1c4626'), hex('#1a4024')] as const
const SHADOW = hex('#0c1c10')
const FLOWERS = [hex('#f8f0f0'), hex('#f88aa8'), hex('#98b8f8')] as const
const POLLEN = hex('#f8d848')
const TINTS = [hex(TEAM_COLORS[0]), hex(TEAM_COLORS[1])] as const

/* ---------------- Ground patterns (world px) ---------------- */

/** Grass, two tones in soft patches, specks, tufts and (out of the jungle) a few flowers. */
const grassAt = (x: number, y: number, jungle: boolean, out: number[]) => {
  const p = jungle ? JUNGLE : GRASS
  const h = hash2(x, y, 11)
  // Tufts: a "v" of darker blades, one per lucky 8 px cell.
  const cx = Math.floor(x / 8)
  const cy = Math.floor(y / 8)
  if (hash2(cx, cy, 12) < 0.22) {
    const dx = x - (cx * 8 + Math.floor(hash2(cx, cy, 13) * 5))
    const dy = y - (cy * 8 + Math.floor(hash2(cx, cy, 14) * 5))
    if ((dy === 0 && (dx === 0 || dx === 2)) || (dy === 1 && dx === 1)) return set(out, dy === 0 ? p.tuft : p.dark)
  }
  if (!jungle) {
    const fx = Math.floor(x / 14)
    const fy = Math.floor(y / 14)
    if (hash2(fx, fy, 15) < 0.07) {
      const dx = x - (fx * 14 + 3 + Math.floor(hash2(fx, fy, 16) * 8))
      const dy = y - (fy * 14 + 3 + Math.floor(hash2(fx, fy, 17) * 8))
      if (dx === 0 && dy === 0) return set(out, POLLEN)
      if (Math.abs(dx) + Math.abs(dy) === 1) return set(out, FLOWERS[Math.floor(hash2(fx, fy, 18) * FLOWERS.length)]!)
    }
  }
  if (h < 0.05) return set(out, p.dark)
  if (h > 0.986) return set(out, p.light)
  return set(out, noise2(x, y, 22, jungle ? 21 : 20) > 0.55 ? p.alt : p.main)
}

/** Worn dirt: two tones, pebbles and light grains. */
const dirtAt = (x: number, y: number, out: number[]) => {
  const h = hash2(x, y, 31)
  if (h < 0.035) return set(out, DIRT.dark)
  if (h > 0.985) return set(out, DIRT.light)
  return set(out, noise2(x, y, 14, 32) > 0.58 ? DIRT.alt : DIRT.main)
}

/**
 * How deep (x, y) sits in a dirt path (> 0 inside, the ragged edge around
 * 0): the lanes' paths along their middle, the passages' columns from the
 * lanes into the jungle, and the ways from each base into the jungle.
 */
const pathDepth = (x: number, y: number) => {
  let best = -Infinity
  if (Math.abs(y) >= 200) {
    const half = 17 + noise1(x, 18, 41) * 8
    best = Math.max(best, half - Math.abs(Math.abs(y) - LANE_Y))
  }
  const ay = Math.abs(y)
  if (ay >= 136 && ay <= LANE_Y) {
    for (const cx of PASSAGES) {
      const half = 16 + noise1(y, 14, 42 + cx) * 7
      best = Math.max(best, half - Math.abs(x - cx))
    }
  }
  const ax = Math.abs(x)
  if (ax >= 430 && ax <= 560) best = Math.max(best, 15 + noise1(x, 12, 43) * 6 - Math.abs(y))
  return best
}

/** The bases' flagstones, staggered rows, tinted toward their team. */
const stoneAt = (x: number, y: number, out: number[]) => {
  const W = 18
  const H = 13
  const row = Math.floor((y + 1300) / H)
  const sx = x + 1300 + (row % 2) * 9
  const col = Math.floor(sx / W)
  const lx = sx - col * W
  const ly = y + 1300 - row * H
  const team = x < 0 ? 0 : 1
  if (lx === 0 || ly === 0) return set(out, STONE.grout)
  const tone = hash2(col, row, 51) < 0.5 ? STONE.a : STONE.b
  const base = lx === 1 || ly === 1 ? STONE.lit : tone
  const speck = hash2(x, y, 52) < 0.04 ? 0.18 : 0
  mixInto(out, base, TINTS[team], 0.16)
  if (speck) mixInto(out, out, STONE.grout, speck)
}

/**
 * The hedge wall: round leafy clumps, lit from the top left, dark gaps
 * between. Repeats every 256 px (its cells hashed modulo 32), so a tile with
 * no floor near it is the same everywhere and baked once.
 */
const hedgeAt = (x: number, y: number, out: number[]) => {
  const C = 8
  const cx = Math.floor(x / C)
  const cy = Math.floor(y / C)
  let best = Infinity
  let bdx = 0
  let bdy = 0
  let br = 1
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const kx = (((cx + i) % 32) + 32) % 32
      const ky = (((cy + j) % 32) + 32) % 32
      const ox = (cx + i) * C + 1 + hash2(kx, ky, 61) * 6
      const oy = (cy + j) * C + 1 + hash2(kx, ky, 62) * 6
      const r = 5 + hash2(kx, ky, 63) * 2.5
      const dx = x + 0.5 - ox
      const dy = y + 0.5 - oy
      const d = Math.sqrt(dx * dx + dy * dy) - r
      if (d < best) {
        best = d
        bdx = dx
        bdy = dy
        br = r
      }
    }
  }
  if (best > 0) return set(out, HEDGE.gap)
  const k = (-bdx * 0.55 - bdy * 0.75) / br
  const px = ((x % 256) + 256) % 256
  const py = ((y % 256) + 256) % 256
  if (hash2(px, py, 64) < 0.05) return set(out, HEDGE.leaf)
  return set(out, k > 0.4 ? HEDGE.light : k > -0.35 ? HEDGE.mid : HEDGE.dark)
}

const set = (out: number[], c: RGB) => {
  out[0] = c[0]
  out[1] = c[1]
  out[2] = c[2]
}

const mixInto = (out: number[], a: RGB | number[], b: RGB, k: number) => {
  out[0] = Math.round(a[0]! + (b[0] - a[0]!) * k)
  out[1] = Math.round(a[1]! + (b[1] - a[1]!) * k)
  out[2] = Math.round(a[2]! + (b[2] - a[2]!) * k)
}

/** A floor pixel's color before the hedge's shadows. */
const floorAt = (x: number, y: number, out: number[]) => {
  const zone = zoneAt(x, y)
  if (zone === 'base') return stoneAt(x, y, out)
  const depth = pathDepth(x, y)
  // The path's edge frays: grass and dirt dither over a couple of pixels.
  if (depth > 1.5 || (depth > -1.5 && hash2(x, y, 44) < (depth + 1.5) / 3)) return dirtAt(x, y, out)
  grassAt(x, y, zone === 'jungle', out)
}

/* ---------------- Baking ---------------- */

const TILE = 256
/** How far past a tile its floor mask reaches (the rims and shadows look that far). */
const M = 8
const SPAN = TILE + M * 2

/** Whether a tile (`tx`, `ty` in tiles) has no floor within `M` px: all hedge, the shared tile. */
const pureHedge = (tx: number, ty: number) => {
  const x0 = tx * TILE - M
  const y0 = ty * TILE - M
  const x1 = x0 + SPAN
  const y1 = y0 + SPAN
  return !VALE.rects.some((r) => r.x0 < x1 && r.x1 > x0 && r.y0 < y1 && r.y1 > y0)
}

/** Bakes the tile whose top left is world (ox, oy); `pure`: no floor at all. */
const bake = (ox: number, oy: number, pure: boolean) => {
  const mask = new Uint8Array(SPAN * SPAN)
  if (!pure) for (let py = 0; py < SPAN; py++) for (let px = 0; px < SPAN; px++) mask[py * SPAN + px] = onFloor(ox + px - M, oy + py - M) ? 1 : 0
  const at = (px: number, py: number) => mask[(py + M) * SPAN + px + M] === 1
  const canvas = createCanvas(TILE, TILE)
  const ctx = context2d(canvas)
  const img = ctx.createImageData(TILE, TILE)
  const c = [0, 0, 0]
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const x = ox + px
      const y = oy + py
      if (at(px, py)) {
        floorAt(x, y, c)
        // The hedge casts a shadow down onto the floor below it, and a thin one at its other edges.
        let north = 0
        for (let d = 1; d <= 6 && !north; d++) if (!at(px, py - d)) north = d
        if (north) mixInto(c, c, SHADOW, 0.5 - north * 0.065)
        else if (!at(px - 1, py) || !at(px + 1, py) || !at(px, py + 1)) mixInto(c, c, SHADOW, 0.25)
      } else {
        // South of the hedge, where the floor lies below, its front face shows; elsewhere a lit rim.
        let south = 0
        for (let d = 1; d <= 6 && !south; d++) if (at(px, py + d)) south = d
        if (south) {
          hedgeAt(x, y, c)
          const face = south === 1 ? FACE[0] : FACE[1 + ((((Math.floor(x / 2) + south) % 3) + 3) % 3)]!
          if (south <= 2 || hash2(x, y, 71) < 0.7) set(c, face)
        } else {
          let near = 0
          for (let d = 1; d <= 2 && !near; d++) if (at(px - d, py) || at(px + d, py) || at(px, py - d)) near = d
          if (near) set(c, RIM[near - 1]!)
          else hedgeAt(x, y, c)
        }
      }
      const i = (py * TILE + px) * 4
      img.data[i] = c[0]!
      img.data[i + 1] = c[1]!
      img.data[i + 2] = c[2]!
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

const tiles = canvasCache<number, HTMLCanvasElement>()
const keyOf = (tx: number, ty: number) => (tx + 512) * 1024 + (ty + 512)
const HEDGE_TILE = lazy(() => bake(0, 0, true))

const tileAt = (tx: number, ty: number) => {
  if (pureHedge(tx, ty)) return HEDGE_TILE()
  const key = keyOf(tx, ty)
  let tile = tiles.get(key)
  if (!tile) tiles.set(key, (tile = bake(tx * TILE, ty * TILE, false)))
  return tile
}

/** Every tile with floor in it, nearest the middle first. */
const FLOOR_TILES = (() => {
  const x0 = Math.floor((Math.min(...VALE.rects.map((r) => r.x0)) - M) / TILE)
  const x1 = Math.floor((Math.max(...VALE.rects.map((r) => r.x1)) + M) / TILE)
  const y0 = Math.floor((Math.min(...VALE.rects.map((r) => r.y0)) - M) / TILE)
  const y1 = Math.floor((Math.max(...VALE.rects.map((r) => r.y1)) + M) / TILE)
  const out: [number, number][] = []
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!pureHedge(tx, ty)) out.push([tx, ty])
  return out.sort((a, b) => Math.hypot(a[0] + 0.5, a[1] + 0.5) - Math.hypot(b[0] + 0.5, b[1] + 0.5))
})()

/** Bakes one of the Vale's tiles not baked yet (idle time, `warmScenery`), so walking into one never stalls a frame. True if it baked one. */
export const warmVale = () => {
  const missing = FLOOR_TILES.find(([tx, ty]) => !tiles.has(keyOf(tx, ty)))
  if (!missing) return false
  tileAt(missing[0], missing[1])
  return true
}

/** Frees the Vale's tiles (about 0.25 MB each) once no match is on. */
export const dropVale = () => {
  if (tiles.size === 0) return
  for (const tile of tiles.values()) tile.width = tile.height = 0
  tiles.clear()
}

/** The Vale's floor for the view at (camX, camY), `w`×`h` (whole px). Replaces the map's ground in a match. */
export const drawValeFloor = (ctx: Ctx, camX: number, camY: number, w: number, h: number) => {
  for (let ty = Math.floor(camY / TILE); ty <= Math.floor((camY + h - 1) / TILE); ty++) {
    for (let tx = Math.floor(camX / TILE); tx <= Math.floor((camX + w - 1) / TILE); tx++) ctx.drawImage(tileAt(tx, ty), tx * TILE - camX, ty * TILE - camY)
  }
}

/* ---------------- Pads and goals ---------------- */

type ZoneLook = 'open' | 'locked' | 'broken' | 'pad'

const rgba = (c: ArrayLike<number>, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

/**
 * A zone on the ground as one sprite: a disc of radius `r` filled faintly in
 * the team's color, its rim, an inner dashed ring and a faint diagonal hatch;
 * a locked goal dim, a broken one grey and cracked, a spawn pad with healing crosses.
 */
const bakeZone = (team: Team, look: ZoneLook, r: number) => {
  const size = r * 2 + 3
  const c = size / 2
  const canvas = createCanvas(size, size)
  const ctx = context2d(canvas)
  const grey = hex('#8a8a90')
  const color = look === 'broken' ? grey : TINTS[team]
  const dark: number[] = [0, 0, 0]
  mixInto(dark, color, hex('#101018'), 0.45)
  const light: number[] = [0, 0, 0]
  mixInto(light, color, hex('#ffffff'), 0.45)
  const fill = look === 'open' ? 0.26 : look === 'pad' ? 0.18 : look === 'locked' ? 0.12 : 0.22
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = px + 0.5 - c
      const dy = py + 0.5 - c
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > r + 1) continue
      let style: string
      if (d > r) style = rgba(dark, look === 'locked' ? 0.6 : 0.9)
      else if (d > r - 2) style = look === 'locked' ? rgba(color, 0.55) : rgba(look === 'broken' ? color : light, 0.95)
      else if (d > r - 9 && d <= r - 7 && Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0) style = rgba(color, look === 'locked' ? 0.3 : 0.6)
      else style = rgba(color, fill + ((px + py) % 6 === 0 ? 0.08 : 0))
      ctx.fillStyle = style
      ctx.fillRect(px, py, 1, 1)
    }
  }
  if (look === 'broken') {
    // Cracks: jagged rays from the middle.
    for (let k = 0; k < 6; k++) {
      let a = (k / 6) * Math.PI * 2 + hash2(k, r, 81) * 0.6
      for (let d = 3; d < r - 2; d++) {
        a += (hash2(k, d, 82) - 0.5) * 0.25
        const x = Math.round(c + Math.cos(a) * d - 0.5)
        const y = Math.round(c + Math.sin(a) * d - 0.5)
        ctx.fillStyle = '#383840'
        ctx.fillRect(x, y, 1, 1)
        ctx.fillStyle = '#b0b0b8'
        ctx.fillRect(x, y + 1, 1, 1)
      }
    }
  }
  if (look === 'pad') {
    // Healing crosses around the pad.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      const x = Math.round(c + Math.cos(a) * (r - 16))
      const y = Math.round(c + Math.sin(a) * (r - 16))
      ctx.fillStyle = rgba(light, 0.8)
      ctx.fillRect(x - 2, y, 5, 1)
      ctx.fillRect(x, y - 2, 1, 5)
    }
  }
  return canvas
}

const zones = canvasCache<string, PixelSprite>()
const zoneSprite = (team: Team, look: ZoneLook, r: number) => {
  const key = `${team}:${look}:${r}`
  let s = zones.get(key)
  if (!s) zones.set(key, (s = bakeZone(team, look, r)))
  return s
}

/** A base goal still shut: a small padlock. */
const PADLOCK = lazy(() =>
  fromStrings(['.11111.', '11...11', '1.....1', '1111111', '1222221', '1223221', '1222221', '1111111'], { 1: '#282830', 2: '#e0b848', 3: '#282830' }),
)

/** Ground zones under everything: the spawn pads and the goals (open, shut until a lane goal falls, broken). */
export const drawValeZones = (ctx: Ctx, g: Game, t: number) => {
  const s = g.versus
  if (!s) return
  VALE.spawn.forEach((pad, team) => {
    blitCentered(ctx, zoneSprite(team as Team, 'pad', VERSUS.spawnPad.r), pad.x, pad.y)
    dashedRing(ctx, pad.x, pad.y, VERSUS.spawnPad.r - 4, t * 0.8, [TEAM_LIGHT[team as Team], '#ffffff'], 0.35)
  })
  for (const goal of s.goals) {
    const open = goalOpen(s, goal)
    const look: ZoneLook = goal.broken ? 'broken' : open ? 'open' : 'locked'
    blitCentered(ctx, zoneSprite(goal.team, look, goal.r), goal.x, goal.y)
    if (look === 'locked') blitCentered(ctx, PADLOCK(), goal.x, goal.y)
    // An open goal's rim runs, faster as it empties.
    if (look === 'open') dashedRing(ctx, goal.x, goal.y, goal.r + 2, t * (1.5 + (1 - goal.left / goal.max) * 3), [TEAM_LIGHT[goal.team], '#ffffff', TEAM_COLORS[goal.team]], 0.45)
  }
}

/* ---------------- Orbs and channels ---------------- */

const ORB = lazy(() => ({
  small: fromStrings(['.111.', '12321', '13431', '12321', '.111.'], { 1: '#8a4c08', 2: '#e8a020', 3: '#f8d040', 4: '#ffffff' }),
  big: fromStrings(['..111..', '.12221.', '1233321', '1234321', '1233321', '.12221.', '..111..'], { 1: '#8a4c08', 2: '#e8a020', 3: '#f8d040', 4: '#ffffff' }),
}))

/** The small orb glyph the Energy badges wear (`render/team.ts`). */
export const orbGlyph = () => ORB().small

/** Pixel arc of `k` (0..1) of an ellipse, clockwise from the top, with a dark rim outside. */
const arc = (ctx: Ctx, x: number, y: number, rx: number, ry: number, k: number, color: string) => {
  const steps = Math.ceil(Math.max(rx, ry) * Math.PI * 3)
  const last = Math.floor(steps * Math.min(1, k))
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI * 2
    const cx = Math.cos(a)
    const cy = Math.sin(a)
    ctx.fillStyle = '#181818'
    ctx.fillRect(Math.round(x + cx * (rx + 1)), Math.round(y + cy * (ry + 1)), 1, 1)
    ctx.fillStyle = i <= last ? color : 'rgba(255,255,255,0.25)'
    ctx.fillRect(Math.round(x + cx * rx), Math.round(y + cy * ry), 1, 1)
  }
}

/** Teammates of `p` standing in the goal they channel into, as the match counts them (`updateGoals`). */
const alliesIn = (g: Game, p: Player, goal: GoalState) => {
  let n = 0
  for (const q of g.players) {
    if (q === p || q.hp <= 0 || q.gone || q.versus?.team !== p.versus?.team) continue
    const dx = q.x - goal.x
    const dy = q.y - goal.y
    if (dx * dx + dy * dy < goal.r * goal.r) n++
  }
  return n
}

/** How far `p`'s channel into the goal they stand in has gone (0..1), or null when they aren't channeling. */
export const channelShare = (s: VersusState, g: Game, p: Player) => {
  const v = p.versus
  if (!v || v.goal < 0 || v.energy <= 0 || p.hp <= 0) return null
  const goal = s.goals[v.goal]
  if (!goal) return null
  return Math.max(0, Math.min(1, v.channel / channelTime(v.energy, alliesIn(g, p, goal))))
}

/** On the ground over the zones: the Energy orbs (bobbing, blinking out at the end of their time) and each scorer's channel arc. */
export const drawValeGround = (ctx: Ctx, g: Game, t: number, visible: (x: number, y: number) => boolean) => {
  const s = g.versus
  if (!s) return
  const orb = ORB()
  for (const o of s.orbs) {
    if (!visible(o.x, o.y)) continue
    const left = VERSUS.energy.ttl - o.age
    if (left < 6 && Math.floor(t * (left < 2 ? 12 : 6)) % 2 === 0) continue
    const moving = Math.abs(o.vx) + Math.abs(o.vy) > 4
    const bob = moving ? 0 : Math.round(Math.sin(t * 4 + o.id) * 1.2)
    blitEllipse(ctx, 3, 1, 'rgba(16,40,16,0.3)', o.x, o.y + 4)
    blitEllipse(ctx, 5, 3, 'rgba(248,208,64,0.22)', o.x, o.y + 3)
    blitCentered(ctx, o.value >= 5 ? orb.big : orb.small, o.x, o.y - 2 + bob)
    // A glint now and then.
    if (Math.floor(t * 3 + o.id * 0.7) % 5 === 0) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(Math.round(o.x) + 2, Math.round(o.y) - 5 + bob, 1, 1)
    }
  }
  for (const p of g.players) {
    const k = channelShare(s, g, p)
    if (k === null || !visible(p.x, p.y)) continue
    arc(ctx, p.x, p.y + 1, 15, 7, k, TEAM_LIGHT[p.versus!.team])
  }
}

/* ---------------- Over everyone ---------------- */

const numbers: string[] = []
const numberText = (n: number) => (numbers[n] ??= String(n))

/** Over everyone: each standing goal's points left, in its team's color (grey while shut). */
export const drawValeAir = (ctx: Ctx, g: Game) => {
  const s = g.versus
  if (!s) return
  for (const goal of s.goals) {
    if (goal.broken) continue
    const color = goalOpen(s, goal) ? TEAM_LIGHT[goal.team] : '#a8a8b0'
    blitPacked(ctx, textSprite(numberText(Math.max(0, Math.round(goal.left))), color), goal.x, goal.y - goal.r - 6)
  }
}
