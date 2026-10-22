import { blitEllipse, blitRotated } from '../engine/pixelart'
import { TAU } from '../engine/math'
import { hash2 } from '../engine/rng'
import { TYPE_COLORS } from '../data/types'
import { HEAT } from '../game/legendaryMoves2'
import type { Attack, Game } from '../game/types'
import { ownerOf } from '../game/players'
import { LEGEND_FX_2 } from './legendaryArt2'
import { band, clamp01, fadeOut, px, radiusOf, spokes, thickLine, twinkle, type Ctx } from './legendaryFx'
import { dashedRing } from './strokes'

/**
 * Art of the second batch of legendary moves (`game/legendaryMoves2.ts`):
 * the trios', Mewtwo's and Arceus's capstones. Like `legendaryFx.ts`, two
 * passes a frame from `draw.ts`: `drawLegendary2Ground` under the Pokémon
 * (fields, rings, craters, shadows) and `drawLegendary2Air` over them.
 * Everything snaps to whole pixels.
 */

/** A jagged bolt from (x0, y0) to (x1, y1): `seed` fixes its zigzag, `jag` how far it strays. */
const zigzag = (ctx: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, jag: number, edge: string, core: string, w = 3) => {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(2, Math.round(len / 7))
  const nx = -(y1 - y0) / (len || 1)
  const ny = (x1 - x0) / (len || 1)
  let px0 = x0
  let py0 = y0
  for (let i = 1; i <= steps; i++) {
    const k = i / steps
    const off = i === steps ? 0 : (hash2(seed, i) - 0.5) * jag * 2
    const qx = x0 + (x1 - x0) * k + nx * off
    const qy = y0 + (y1 - y0) * k + ny * off
    thickLine(ctx, px0, py0, qx, qy, w, edge)
    thickLine(ctx, px0, py0, qx, qy, Math.max(1, w - 2), core)
    px0 = qx
    py0 = qy
  }
}

/* ---------------- Articuno: Snowscape ---------------- */

const ICE = ['#ffffff', '#c8f0ff', '#88c8f0', '#4878c8'] as const

const drawCrystalGround = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  ctx.globalAlpha = 0.55 * clamp01(a.age / 0.3)
  blitEllipse(ctx, Math.round(r * 1.2), Math.max(1, Math.round(r * 0.5)), 'rgba(136,200,240,0.45)', a.x, a.y + 10)
  dashedRing(ctx, a.x, a.y + 10, r * 1.5, t * 4 + a.id, ICE, 0.4, 0.45)
  ctx.globalAlpha = 1
}

/** A crystal: spinning in the air on a pale glow, frost trailing while it drifts, flickering white just before it shatters. */
const drawCrystal = (ctx: Ctx, a: Attack, t: number) => {
  const toShatter = a.memo - a.age
  const flash = toShatter < 0.25 && Math.floor(t * 24) % 2 === 0
  const bob = Math.round(Math.sin(t * 3 + a.id) * 1.5)
  if (a.motion.kind === 'drift') {
    const sp = Math.hypot(a.motion.vx, a.motion.vy)
    if (sp > 20) {
      const ux = a.motion.vx / sp
      const uy = a.motion.vy / sp
      for (let d = 3; d < Math.min(24, sp * 0.12); d += 2) px(ctx, a.x - ux * d, a.y - uy * d + bob, ICE[1 + (d % 3)]!)
    }
  }
  blitEllipse(ctx, 7, 7, 'rgba(200,240,255,0.35)', a.x, a.y + bob)
  blitRotated(ctx, LEGEND_FX_2.crystal(), a.x, a.y + bob, t * 1.5 + a.id, a.flip ? 1 : 2)
  if (flash) blitEllipse(ctx, a.flip ? 4 : 7, a.flip ? 4 : 7, 'rgba(255,255,255,0.8)', a.x, a.y + bob)
  if ((Math.floor(t * 6) + a.id) % 5 === 0) twinkle(ctx, a.x + 5, a.y - 6 + bob, 2, '#ffffff')
}

/** The shatter: a white ring, shards of ice flung out and snowflakes drifting down. */
const drawSnowShatter = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  if (a.age < 0.05) blitEllipse(ctx, Math.round(r * 0.6), Math.round(r * 0.6), '#ffffff', a.x, a.y)
  ctx.globalAlpha = 1 - k
  band(ctx, a.x, a.y, r * (0.4 + 0.6 * Math.sqrt(k)), 2, '#ffffff', 0.8)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + a.id
    const d = r * (0.3 + 1.1 * k)
    const x = a.x + Math.cos(ang) * d
    const y = a.y + Math.sin(ang) * d * 0.8 + k * k * 10
    thickLine(ctx, x, y, x - Math.cos(ang) * 4, y - Math.sin(ang) * 4, 2, i % 2 ? ICE[2] : ICE[1])
    px(ctx, x, y, '#ffffff')
  }
  ctx.globalAlpha = 1
}

/* ---------------- Zapdos: Electric Terrain ---------------- */

const SPARK = ['#ffffff', '#f8f088', '#f8d030', '#c89000'] as const

/** The field: a crackling lattice of current across the ground, its rim buzzing. */
const drawTerrainField = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const presence = Math.min(clamp01(a.age / 0.2), fadeOut(a, 0.3))
  ctx.globalAlpha = 0.28 * presence
  blitEllipse(ctx, Math.round(r), Math.max(1, Math.round(r * 0.7)), '#f8e060', a.x, a.y)
  ctx.globalAlpha = presence
  // The lattice: diamonds of current that flicker on and off.
  const cell = 14
  const ox = Math.round(a.x)
  const oy = Math.round(a.y)
  const span = Math.ceil(r / cell)
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      const cx = ox + i * cell + (j % 2 ? cell / 2 : 0)
      const cy = oy + j * cell * 0.7
      const dx = (cx - a.x) / r
      const dy = (cy - a.y) / (r * 0.7)
      if (dx * dx + dy * dy > 0.92) continue
      const on = hash2(i * 31 + j, Math.floor(t * 12), a.id) > 0.45
      if (!on) continue
      const c = SPARK[(i + j + Math.floor(t * 10)) % 3]!
      // A little zigzag of current, and a line toward the next node.
      px(ctx, cx - 4, cy, c, 4, 1)
      px(ctx, cx - 1, cy - 2, c, 1, 3)
      px(ctx, cx, cy - 2, c, 4, 1)
      if ((i + j) % 2 === 0) px(ctx, cx + 4, cy - 1, '#f8d030', cell / 2 - 2, 1)
    }
  }
  dashedRing(ctx, a.x, a.y, r, t * 14, SPARK, 0.6, 0.7)
  dashedRing(ctx, a.x, a.y, r - 3, -t * 10, ['#f8d030', '#ffffff'], 0.35, 0.7)
  ctx.globalAlpha = 1
}

/** A bolt from the sky onto its foe, a flash and sparks on the ground; it thins out as it fades. */
const drawTerrainBolt = (ctx: Ctx, g: Game, a: Attack) => {
  const k = a.age / a.ttl
  const top = Math.max(g.camera.y - 10, a.y - 150)
  ctx.globalAlpha = k < 0.5 ? 1 : (1 - k) * 2
  zigzag(ctx, a.x + (a.flip ? 14 : -14), top, a.x, a.y, a.id, 7, '#c89000', '#c89000', k < 0.5 ? 6 : 4)
  zigzag(ctx, a.x + (a.flip ? 14 : -14), top, a.x, a.y, a.id, 7, '#f8e030', '#ffffff', k < 0.5 ? 4 : 2)
  blitEllipse(ctx, 12, 6, 'rgba(255,255,220,0.7)', a.x, a.y)
  spokes(ctx, a.x, a.y, 4, 14, 8, SPARK, a.id, 0.6)
  ctx.globalAlpha = 1
}

/* ---------------- Moltres: Overheat ---------------- */

const FIRE = ['#fff8d0', '#f8c030', '#f06018', '#a01810'] as const

/** Moltres's heat on `g`'s player between casts: embers at one, flames licking up at two (the next cast overheats). `draw.ts` draws it for each player. */
export const drawHeatAura = (ctx: Ctx, g: Game, t: number) => {
  const owned = g.player.moves.find((m) => m.id === 'overheat')
  const heat = owned?.stacks ?? 0
  if (heat <= 0) return
  const p = g.player
  const n = heat >= HEAT.cycle - 1 ? 10 : 4
  for (let i = 0; i < n; i++) {
    const ph = (t * (1.2 + heat * 0.4) + i / n) % 1
    const x = p.x + Math.sin(i * 2.4 + t * 2) * (p.radius + 3)
    px(ctx, x, p.y - 2 - ph * (10 + heat * 6), FIRE[Math.min(3, Math.floor(ph * 4))]!, heat > 1 ? 2 : 1, heat > 1 ? 2 : 1)
  }
  if (heat >= HEAT.cycle - 1) {
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 12)
    blitEllipse(ctx, p.radius + 6, Math.round((p.radius + 6) * 0.45), '#f87020', p.x, p.y)
    ctx.globalAlpha = 1
  }
}

const drawFeather = (ctx: Ctx, a: Attack, t: number) => {
  const ux = Math.cos(a.memo)
  const uy = Math.sin(a.memo)
  for (let d = 4; d < 18; d++) {
    if ((d + Math.floor(t * 30)) % 3 === 0) continue
    const w = Math.sin(d * 0.6 - t * 20) * 2
    px(ctx, a.x - ux * d - uy * w, a.y - uy * d + ux * w, FIRE[Math.min(3, Math.floor(d / 5))]!)
  }
  blitEllipse(ctx, 6, 6, 'rgba(248,160,48,0.35)', a.x, a.y)
  blitRotated(ctx, LEGEND_FX_2.feather()[Math.floor(t * 12 + a.id) % 2]!, a.x, a.y, a.memo, 1)
}

/** The windup draws fire into the player; then the nova: a blazing disc with flame wings spread wide, burning out at the rim. */
const drawHeatNova = (ctx: Ctx, a: Attack, t: number) => {
  if (a.age < HEAT.windup) {
    const k = a.age / HEAT.windup
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * TAU + a.id
      const d = (1 - k) * 60 + 6
      px(ctx, a.x + Math.cos(ang) * d, a.y + Math.sin(ang) * d * 0.7, FIRE[i % 3]!, 2, 2)
    }
    blitEllipse(ctx, 8 + Math.round(k * 6), 8 + Math.round(k * 6), 'rgba(248,192,48,0.55)', a.x, a.y)
    return
  }
  const r = radiusOf(a)
  const k = clamp01((a.age - HEAT.windup) / (a.ttl - HEAT.windup))
  ctx.globalAlpha = 1 - k * 0.85
  blitEllipse(ctx, Math.round(r), Math.round(r * 0.75), 'rgba(248,112,32,0.28)', a.x, a.y)
  blitEllipse(ctx, Math.round(r * 0.55), Math.round(r * 0.42), 'rgba(248,208,64,0.35)', a.x, a.y)
  band(ctx, a.x, a.y, r, 3, '#f06018', 0.75)
  band(ctx, a.x, a.y, r - 3, 2, '#f8c030', 0.75)
  dashedRing(ctx, a.x, a.y, r + 2, t * 8, FIRE, 0.6, 0.75)
  // Moltres's wings of fire, spread to either side.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const f = i / 25
      const span = r * 0.95 * f
      const lift = Math.sin(f * Math.PI) * r * 0.55 + f * r * 0.15
      const x = a.x + side * span
      const y = a.y - lift + Math.sin(t * 16 + i) * 1.5
      const len = Math.round((1 - f * 0.6) * 10)
      for (let d = 0; d < len; d++) px(ctx, x - side * d * 0.3, y + d, FIRE[Math.min(3, Math.floor((d / len) * 4))]!, 2, 1)
    }
  }
  ctx.globalAlpha = 1
}

/* ---------------- Raikou: Thunderclap ---------------- */

const drawClapBolt = (ctx: Ctx, a: Attack) => {
  const k = a.age / a.ttl
  ctx.globalAlpha = k < 0.3 ? 1 : (1 - k) / 0.7
  zigzag(ctx, a.from.x, a.from.y, a.x, a.y, a.id, 10, '#3a2470', '#3a2470', 5)
  zigzag(ctx, a.from.x, a.from.y, a.x, a.y, a.id, 10, '#f8e030', '#ffffff', 4)
  if (k < 0.3) {
    blitEllipse(ctx, 7, 7, 'rgba(255,255,255,0.8)', a.x, a.y)
    spokes(ctx, a.x, a.y, 3, 10, 6, SPARK, a.id)
  }
  ctx.globalAlpha = 1
}

/** The thunderclap: a flash, a yellow shockwave with Raikou's purple storm cloud rolling out behind it. */
const drawClapBurst = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  if (a.age < 0.06) blitEllipse(ctx, Math.round(r * 0.8), Math.round(r * 0.8), '#ffffff', a.x, a.y)
  ctx.globalAlpha = 1 - k
  const rr = r * (0.4 + 0.7 * Math.sqrt(k))
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * TAU + a.id
    blitEllipse(ctx, 6, 4, 'rgba(120,80,176,0.55)', a.x + Math.cos(ang) * rr * 0.8, a.y + Math.sin(ang) * rr * 0.6)
  }
  band(ctx, a.x, a.y, rr, 3, '#f8d030', 0.8)
  band(ctx, a.x, a.y, rr - 3, 1, '#ffffff', 0.8)
  spokes(ctx, a.x, a.y, rr * 0.5, rr * 1.2, 12, ['#ffffff', '#f8e060', '#a878e8'], a.id, 0.8)
  ctx.globalAlpha = 1
}

/* ---------------- Entei: Burning Bulwark ---------------- */

/** The shell: plates of dark volcanic rock circling the player over a molten glow, cracks pulsing; it flickers as it runs out. */
const drawBulwarkShell = (ctx: Ctx, a: Attack, t: number) => {
  if (a.ttl - a.age < 0.4 && Math.floor(t * 20) % 2 === 0) return
  const r = radiusOf(a) + 4
  const born = clamp01(a.age / 0.2)
  ctx.globalAlpha = 0.4
  blitEllipse(ctx, Math.round(r * born), Math.round(r * 0.9 * born), '#f86018', a.x, a.y)
  ctx.globalAlpha = 1
  // Flames licking up off the shell.
  for (let i = 0; i < 12; i++) {
    const ph = (t * 1.8 + i / 12) % 1
    const ang = (i / 12) * TAU + a.id
    px(ctx, a.x + Math.cos(ang) * r * born, a.y + Math.sin(ang) * r * 0.6 * born - ph * 14, FIRE[Math.min(3, Math.floor(ph * 4))]!, 2, 2)
  }
  const plates = 12
  for (let i = 0; i < plates; i++) {
    const ang = t * 1.6 + (i / plates) * TAU
    const front = Math.sin(ang) > 0
    const x = a.x + Math.cos(ang) * r * born
    const y = a.y + Math.sin(ang) * r * 0.6 * born
    const w = front ? 7 : 4
    px(ctx, x - w / 2 - 1, y - 5, '#201008', w + 2, 10)
    px(ctx, x - w / 2, y - 4, front ? '#6a4430' : '#3a2418', w, 8)
    px(ctx, x - w / 2 + 1, y - 1, (Math.floor(t * 8) + i) % 3 === 0 ? '#f8e070' : '#f06018', Math.max(1, w - 2), 2)
  }
  dashedRing(ctx, a.x, a.y, r * born + 3, t * 6, FIRE, 0.5, 0.6)
}

/** A geyser: a glowing crack on the ground, then a column of magma shooting up and splashing back down. */
const drawGeyserGround = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  ctx.globalAlpha = 1 - a.age / a.ttl
  blitEllipse(ctx, Math.round(r), Math.max(1, Math.round(r * 0.45)), 'rgba(160,24,16,0.5)', a.x, a.y)
  blitEllipse(ctx, Math.round(r * 0.5), Math.max(1, Math.round(r * 0.22)), '#f8c030', a.x, a.y)
  ctx.globalAlpha = 1
}

const drawGeyser = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  const h = Math.sin(Math.min(1, k * 1.6) * Math.PI) * r * 2.6
  const w = Math.max(3, Math.round(r * 0.7 * (1 - k * 0.5)))
  for (let y = 0; y < h; y += 2) {
    const f = y / Math.max(1, h)
    const sway = Math.sin(y * 0.3 + t * 20 + a.id) * 1.5
    px(ctx, a.x - w / 2 + sway, a.y - y, f > 0.8 ? FIRE[1] : FIRE[2], w, 2)
    px(ctx, a.x - w / 4 + sway, a.y - y, f > 0.6 ? FIRE[0] : FIRE[1], Math.max(1, Math.round(w / 2)), 2)
  }
  for (let i = 0; i < 4; i++) {
    const ang = -Math.PI / 2 + (hash2(a.id, i) - 0.5) * 2
    const d = k * r * 2.2
    px(ctx, a.x + Math.cos(ang) * d, a.y - h * 0.8 + Math.sin(ang) * d + k * k * 30, FIRE[2]!, 2, 2)
  }
}

/* ---------------- Suicune: Aqua Ring ---------------- */

const AURORA = ['#ffffff', '#a8f0f8', '#58b8f0', '#a868e8'] as const

/** Suicune's spirit racing the lap: a crystal-blue streak, its white ribbons and purple mane trailing behind. */
const drawAquaRunner = (ctx: Ctx, g: Game, a: Attack, t: number) => {
  if (a.motion.kind !== 'orbit') return
  const m = a.motion
  const p = ownerOf(g, a.owner)
  const dir = Math.sign(m.spin) || 1
  for (let i = 18; i >= 0; i--) {
    const ang = m.angle - dir * i * 0.07
    const x = p.x + Math.cos(ang) * m.radius
    const y = p.y - 8 + Math.sin(ang) * m.radius
    const f = i / 18
    const w = Math.max(1, Math.round((1 - f) * 6))
    px(ctx, x - w / 2, y - w / 2 - 2, f < 0.3 ? '#a8f0f8' : '#58b8f0', w, w)
    // The ribbons: two thin white strands waving behind.
    const wave = Math.sin(i * 0.9 - t * 18) * (2 + f * 4)
    px(ctx, x + Math.cos(ang) * wave, y + Math.sin(ang) * wave - 4, '#ffffff')
    if (i % 3 === 0) px(ctx, x - Math.cos(ang) * wave, y - Math.sin(ang) * wave - 6, '#a868e8')
  }
  // The head: a white diamond crest over a blue body.
  blitEllipse(ctx, 7, 5, 'rgba(168,240,248,0.5)', a.x, a.y - 3)
  px(ctx, a.x - 4, a.y - 5, '#3878c8', 9, 5)
  px(ctx, a.x - 3, a.y - 4, '#58b8f0', 7, 3)
  px(ctx, a.x - 1, a.y - 9, '#ffffff', 3, 4)
  px(ctx, a.x, a.y - 11, '#ffffff', 1, 2)
  px(ctx, a.x - 2, a.y - 6, '#a868e8', 5, 1)
}

/** A piece of the ring: a short arc of pure water flowing along it, aurora glints riding the crest. */
const drawAquaRing = (ctx: Ctx, g: Game, a: Attack, t: number) => {
  if (a.motion.kind !== 'orbit') return
  const m = a.motion
  const p = ownerOf(g, a.owner)
  const life = Math.min(clamp01(a.age / 0.15), fadeOut(a, 0.4))
  ctx.globalAlpha = life
  // Enough of the arc to meet the next piece: a band of deep water, a lighter crest and white foam.
  const seg = (TAU / 14) * 0.6
  for (let i = -5; i <= 5; i++) {
    const ang = m.angle + (i / 5) * seg
    const wave = Math.sin(ang * 7 + t * 7) * 1.5
    const x = p.x + Math.cos(ang) * (m.radius + wave)
    const y = p.y - 8 + Math.sin(ang) * (m.radius + wave)
    px(ctx, x - 2, y - 1, '#1c4898', 4, 4)
    px(ctx, x - 1, y - 2, '#4890e0', 3, 3)
    px(ctx, x - 1, y - 2, (i + Math.floor(t * 10)) % 4 === 0 ? '#ffffff' : '#a8e8f8', 2, 1)
  }
  const glint = (Math.floor(t * 8) + a.id) % 6
  if (glint === 0) twinkle(ctx, a.x, a.y, 2, AURORA[(a.id + Math.floor(t * 4)) % AURORA.length]!)
  ctx.globalAlpha = 1
}

/* ---------------- Regirock: Rock Wrecker ---------------- */

/** The boulder in flight, on a high arc from the player to where it lands; its shadow grows there. */
const drawBoulderLob = (ctx: Ctx, a: Attack, ground: boolean) => {
  const k = clamp01(a.age / a.ttl)
  if (ground) {
    ctx.globalAlpha = 0.2 + 0.5 * k
    blitEllipse(ctx, Math.round(6 + 10 * k), Math.round(3 + 4 * k), 'rgba(32,24,16,0.6)', a.x, a.y)
    ctx.globalAlpha = 1
    return
  }
  const x = a.from.x + (a.x - a.from.x) * k
  const y = a.from.y + (a.y - 10 - a.from.y) * k - Math.sin(k * Math.PI) * 90
  blitRotated(ctx, LEGEND_FX_2.boulder(), x, y, k * 6, 2)
}

/** The landing: a crater cracked open on the ground; above, a ring of dust and rocks flung out. */
const drawBoulderImpact = (ctx: Ctx, a: Attack, ground: boolean) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  if (ground) {
    ctx.globalAlpha = 1 - k * k
    blitEllipse(ctx, Math.round(r * 0.8), Math.max(1, Math.round(r * 0.35)), 'rgba(48,32,16,0.55)', a.x, a.y)
    for (let i = 0; i < 7; i++) {
      const ang = hash2(a.id, i) * TAU
      for (let d = r * 0.3; d < r * 1.05; d++) {
        const jag = Math.sin(d * 0.7 + i * 3) * 1.2
        px(ctx, a.x + Math.cos(ang) * d - Math.sin(ang) * jag, a.y + (Math.sin(ang) * d + Math.cos(ang) * jag) * 0.45, '#3a2818')
      }
    }
    ctx.globalAlpha = 1
    return
  }
  if (a.age < 0.05) blitEllipse(ctx, Math.round(r * 0.7), Math.round(r * 0.4), '#f8e8c8', a.x, a.y)
  ctx.globalAlpha = 1 - k
  const rr = r * (0.5 + 0.8 * Math.sqrt(k))
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * TAU + a.id
    blitEllipse(ctx, 5, 3, 'rgba(200,176,136,0.6)', a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr * 0.45)
  }
  for (let i = 0; i < 8; i++) {
    const ang = -Math.PI / 2 + (hash2(a.id, i, 2) - 0.5) * 2.6
    const d = k * r * 1.4
    px(ctx, a.x + Math.cos(ang) * d, a.y - 6 + Math.sin(ang) * d + k * k * 40, i % 2 ? '#8a6a48' : '#c8a878', 3, 3)
  }
  ctx.globalAlpha = 1
}

/** The boulder rolling on: turning over the ground, dust kicked up behind it. */
const drawBoulderRoll = (ctx: Ctx, a: Attack, t: number, ground: boolean) => {
  const r = radiusOf(a)
  if (ground) {
    blitEllipse(ctx, Math.round(r * 0.9), Math.max(1, Math.round(r * 0.35)), 'rgba(32,24,16,0.45)', a.x, a.y + 2)
    return
  }
  const ux = Math.cos(a.memo)
  const uy = Math.sin(a.memo)
  ctx.globalAlpha = fadeOut(a, 0.2)
  for (let i = 0; i < 5; i++) {
    const ph = (t * 3 + i * 0.2) % 1
    blitEllipse(ctx, 3 + Math.round(ph * 3), 2, 'rgba(200,176,136,0.5)', a.x - ux * (r + ph * 16), a.y - uy * (r + ph * 16) + 2)
  }
  blitRotated(ctx, LEGEND_FX_2.boulder(), a.x, a.y - r * 0.7, a.age * 9 * (ux >= 0 ? 1 : -1), Math.max(2, Math.round((r * 2) / 13)))
  ctx.globalAlpha = 1
}

/* ---------------- Regice: Glaciate ---------------- */

/** The dome: frozen air bulging around the player, ice spikes growing along its rim and snow inside; it brightens toward absolute zero. */
const drawGlaciateDome = (ctx: Ctx, a: Attack, t: number) => {
  const r = radiusOf(a)
  const k = clamp01(a.age / a.ttl)
  ctx.globalAlpha = 0.18 + k * 0.2
  blitEllipse(ctx, Math.round(r), Math.round(r * 0.75), '#c8f0ff', a.x, a.y)
  ctx.globalAlpha = 0.85
  band(ctx, a.x, a.y, r, 2, '#ffffff', 0.75)
  band(ctx, a.x, a.y, r - 2, 1, '#88c8f0', 0.75)
  dashedRing(ctx, a.x, a.y, r * 0.7, t * 2, ICE, 0.3, 0.75)
  // Ice spikes along the rim, taller as the cold deepens.
  const spikes = Math.max(10, Math.round(r / 5))
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * TAU
    const x = a.x + Math.cos(ang) * r
    const y = a.y + Math.sin(ang) * r * 0.75
    const h = Math.round(2 + k * 7 * (0.6 + hash2(a.id, i) * 0.4))
    for (let d = 0; d < h; d++) px(ctx, x - (d < h - 2 ? 1 : 0), y - d, d > h - 3 ? '#ffffff' : '#88c8f0', d < h - 2 ? 2 : 1, 1)
  }
  // Snow falling inside.
  for (let i = 0; i < 16; i++) {
    const ph = (t * 0.6 + hash2(a.id, i)) % 1
    const x = a.x + (hash2(a.id, i, 1) - 0.5) * r * 1.6
    const y = a.y - r * 0.6 + ph * r * 1.1
    const dx = (x - a.x) / r
    const dy = (y - a.y) / (r * 0.75)
    if (dx * dx + dy * dy < 1) px(ctx, x + Math.sin(t * 2 + i) * 2, y, '#ffffff')
  }
  ctx.globalAlpha = 1
}

/** Absolute zero: a white flash over the dome, cracks racing across it and shards of ice flying out. */
const drawGlaciateShatter = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  ctx.globalAlpha = (1 - k) * 0.7
  blitEllipse(ctx, Math.round(r), Math.round(r * 0.75), '#ffffff', a.x, a.y)
  ctx.globalAlpha = 1 - k
  for (let i = 0; i < 9; i++) {
    const ang = hash2(a.id, i) * TAU
    let x = a.x
    let y = a.y
    for (let s = 1; s <= 5; s++) {
      const d = (r * s) / 5
      const nx = a.x + Math.cos(ang + (hash2(a.id, i, s) - 0.5) * 0.5) * d
      const ny = a.y + Math.sin(ang + (hash2(a.id, i, s) - 0.5) * 0.5) * d * 0.75
      thickLine(ctx, x, y, nx, ny, 1, '#4878c8')
      x = nx
      y = ny
    }
  }
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * TAU + a.id
    const d = r * (0.6 + k * 0.7)
    const x = a.x + Math.cos(ang) * d
    const y = a.y + Math.sin(ang) * d * 0.75 + k * k * 16
    thickLine(ctx, x, y, x + Math.cos(ang) * 4, y + Math.sin(ang) * 3, 2, i % 2 ? '#ffffff' : '#88c8f0')
  }
  ctx.globalAlpha = 1
}

/* ---------------- Registeel: Metal Burst ---------------- */

const STEEL = ['#ffffff', '#e0e8f0', '#a8b4c8', '#687890'] as const

/** Iron Defense on `g`'s player while it holds: steel plates turning slowly around them. `draw.ts` draws it for each player. */
export const drawIronDefense = (ctx: Ctx, g: Game, t: number) => {
  const buff = g.player.moveBuffs.find((b) => b.move === 'metalBurst')
  if (!buff || (buff.left < 0.4 && Math.floor(t * 16) % 2 === 0)) return
  const p = g.player
  const r = p.radius + 8
  for (let i = 0; i < 6; i++) {
    const ang = t * 1.2 + (i / 6) * TAU
    const front = Math.sin(ang) > 0
    const x = p.x + Math.cos(ang) * r
    const y = p.y - 10 + Math.sin(ang) * r * 0.5
    px(ctx, x - 2, y - 3, front ? STEEL[2] : STEEL[3], front ? 4 : 3, 6)
    if (front) px(ctx, x - 1, y - 2, STEEL[0], 1, 3)
  }
}

/** The burst: a steel nova with rivets, hotter (red) the more hits it soaked. */
const drawIronShell = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  const hot = a.tier >= 3
  if (a.age < 0.05) blitEllipse(ctx, Math.round(r * 0.5), Math.round(r * 0.5), '#ffffff', a.x, a.y)
  ctx.globalAlpha = 1 - k
  const rr = r * (0.3 + 0.8 * Math.sqrt(k))
  band(ctx, a.x, a.y, rr, 4, hot ? '#f86040' : STEEL[2], 0.8)
  band(ctx, a.x, a.y, rr - 4, 1, STEEL[0], 0.8)
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * TAU + a.id
    px(ctx, a.x + Math.cos(ang) * (rr - 2) - 1, a.y + Math.sin(ang) * (rr - 2) * 0.8 - 1, STEEL[3], 2, 2)
  }
  spokes(ctx, a.x, a.y, rr * 0.4, rr * 1.1, 8 + a.tier * 2, hot ? ['#ffffff', '#f8a040', '#f84030'] : STEEL, a.id, 0.8)
  ctx.globalAlpha = 1
}

const drawSteelShard = (ctx: Ctx, a: Attack, t: number) => {
  const ux = Math.cos(a.memo)
  const uy = Math.sin(a.memo)
  for (let d = 2; d < 10; d++) px(ctx, a.x - ux * d, a.y - uy * d, d < 5 ? STEEL[1] : STEEL[3])
  thickLine(ctx, a.x - ux * 3, a.y - uy * 3, a.x + ux * 3, a.y + uy * 3, 2, STEEL[2])
  px(ctx, a.x + ux * 3, a.y + uy * 3, (Math.floor(t * 20) + a.id) % 2 ? STEEL[0] : STEEL[1], 2, 2)
}

/* ---------------- Mewtwo: Telekinesis ---------------- */

const PSY = ['#ffffff', '#f0c8ff', '#b050d8', '#702890'] as const

/** Under a held foe: a pulsing psychic ring and the shadow it was lifted off. */
const drawLiftGround = (ctx: Ctx, a: Attack, t: number) => {
  if (a.motion.kind !== 'tether') return
  const e = a.motion.target
  const r = e.radius + 6
  ctx.globalAlpha = 0.6
  blitEllipse(ctx, Math.round(r * 0.8), Math.max(1, Math.round(r * 0.3)), 'rgba(40,16,56,0.55)', e.x, e.y + 3)
  dashedRing(ctx, e.x, e.y + 3, r, t * 10 + a.id, PSY, 0.6, 0.4)
  ctx.globalAlpha = 1
}

/** Over a held foe: Mewtwo's grip, a wavy tendril from the player and sparks rising around it. */
const drawLift = (ctx: Ctx, g: Game, a: Attack, t: number) => {
  if (a.motion.kind !== 'tether') return
  const e = a.motion.target
  const p = ownerOf(g, a.owner)
  const sx = p.x
  const sy = p.y - 14
  const ex = e.x
  const ey = e.y - e.radius
  const len = Math.hypot(ex - sx, ey - sy)
  const steps = Math.max(4, Math.round(len / 3))
  ctx.globalAlpha = 0.75
  for (let i = 0; i <= steps; i++) {
    const k = i / steps
    const wave = Math.sin(k * 9 - t * 14 + a.id) * 3 * Math.sin(k * Math.PI)
    const nx = -(ey - sy) / (len || 1)
    const ny = (ex - sx) / (len || 1)
    px(ctx, sx + (ex - sx) * k + nx * wave - 1, sy + (ey - sy) * k + ny * wave - 1, i % 3 ? PSY[2] : PSY[1], 2, 2)
  }
  // The grip: a purple glow over the foe, a ring squeezing around it.
  ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 12 + a.id)
  blitEllipse(ctx, e.radius + 5, e.radius + 5, '#b050d8', ex, ey + e.radius * 0.3)
  ctx.globalAlpha = 1
  band(ctx, ex, ey + e.radius * 0.4, e.radius + 5 - (Math.floor(t * 8) % 2), 2, PSY[1], 0.5)
  for (let i = 0; i < 5; i++) {
    const ph = (t * 1.6 + hash2(a.id, i)) % 1
    px(ctx, ex + (hash2(a.id, i, 1) - 0.5) * e.radius * 2.4, ey + e.radius - ph * (e.radius * 2 + 10), PSY[i % 3]!, 2, 2)
  }
}

/** The slam: a purple shockwave, streaks pointing where the foe was hurled. */
const drawPsySlam = (ctx: Ctx, a: Attack) => {
  const r = radiusOf(a)
  const k = a.age / a.ttl
  ctx.globalAlpha = 1 - k
  band(ctx, a.x, a.y, r * (0.5 + 0.6 * Math.sqrt(k)), 2, PSY[2], 0.7)
  const ux = Math.cos(a.memo)
  const uy = Math.sin(a.memo)
  for (let i = -2; i <= 2; i++) {
    const ox = -uy * i * 4
    const oy = ux * i * 4
    thickLine(ctx, a.x + ox, a.y + oy, a.x + ox + ux * (10 + k * 22), a.y + oy + uy * (10 + k * 22), 1, i === 0 ? PSY[0] : PSY[1])
  }
  ctx.globalAlpha = 1
}

/* ---------------- Arceus: Judgment ---------------- */

const GOLD = ['#fff4b0', '#f8d030', '#c08818', '#6a4808'] as const

/** Arceus's golden wheel over the player, turning, the plates of the land's type glowing on it. */
const drawJudgmentWheel = (ctx: Ctx, a: Attack, t: number) => {
  const born = clamp01(a.age / 0.2)
  const r = Math.round(24 * born)
  if (r < 2) return
  const color = TYPE_COLORS[a.type]
  ctx.globalAlpha = fadeOut(a, 0.15)
  blitEllipse(ctx, r + 8, Math.round((r + 8) * 0.5), 'rgba(255,244,176,0.4)', a.x, a.y)
  band(ctx, a.x, a.y, r + 1, 2, GOLD[3], 0.5)
  band(ctx, a.x, a.y, r, 3, GOLD[1], 0.5)
  band(ctx, a.x, a.y, r - 1, 1, GOLD[0], 0.5)
  spokes(ctx, a.x, a.y, 3, r - 3, 8, [GOLD[0], GOLD[1]], t * 1.5, 0.5)
  // The plates ride the wheel, the ones in front drawn bigger.
  const plates = Math.max(1, a.tier)
  for (let i = 0; i < plates; i++) {
    const ang = t * 2.4 + (i / plates) * TAU
    const front = Math.sin(ang) > 0
    const x = a.x + Math.cos(ang) * r
    const y = a.y + Math.sin(ang) * r * 0.5
    const w = front ? 7 : 5
    px(ctx, x - w / 2, y - w / 2 - 1, GOLD[3], w, w + 2)
    px(ctx, x - w / 2 + 1, y - w / 2, color, w - 2, w)
    px(ctx, x - w / 2 + 1, y - w / 2, '#ffffff', 2, 1)
  }
  twinkle(ctx, a.x, a.y - 2, 6 + (Math.floor(t * 10) % 2), GOLD[0])
  ctx.globalAlpha = 1
}

/** A lance of light from the wheel through the foes, in the plate's color with a white-hot core. */
const drawJudgmentLance = (ctx: Ctx, a: Attack) => {
  const k = a.age / a.ttl
  const color = TYPE_COLORS[a.type]
  const w = Math.max(1, Math.round((1 - k) * 9))
  ctx.globalAlpha = k < 0.5 ? 1 : (1 - k) * 2
  thickLine(ctx, a.from.x, a.from.y, a.x, a.y, w + 2, GOLD[2])
  thickLine(ctx, a.from.x, a.from.y, a.x, a.y, w, color)
  thickLine(ctx, a.from.x, a.from.y, a.x, a.y, Math.max(1, w - 4), '#ffffff')
  if (a.age < 0.08) blitEllipse(ctx, 7, 7, '#ffffff', a.from.x, a.from.y)
  ctx.globalAlpha = 1
}

/* ---------------- Passes ---------------- */

/** Ground layer (under the Pokémon). */
export const drawLegendary2Ground = (ctx: Ctx, g: Game, t: number) => {
  for (const a of g.attacks) {
    if (a.age < 0) continue
    switch (a.visual) {
      case 'snowCrystal':
        drawCrystalGround(ctx, a, t)
        break
      case 'terrainField':
        drawTerrainField(ctx, a, t)
        break
      case 'magmaGeyser':
        drawGeyserGround(ctx, a)
        break
      case 'aquaRing':
        drawAquaRing(ctx, g, a, t)
        break
      case 'boulderLob':
        drawBoulderLob(ctx, a, true)
        break
      case 'boulderImpact':
        drawBoulderImpact(ctx, a, true)
        break
      case 'boulderRoll':
        drawBoulderRoll(ctx, a, t, true)
        break
      case 'psyLift':
        drawLiftGround(ctx, a, t)
        break
    }
  }
}

/** Air layer (over the Pokémon). */
export const drawLegendary2Air = (ctx: Ctx, g: Game, t: number, visible: (x: number, y: number, m?: number) => boolean) => {
  for (const a of g.attacks) {
    if (a.age < 0) continue
    // Beams, domes and lobs span the screen: they draw even when their center is off it.
    switch (a.visual) {
      case 'judgmentLance':
        drawJudgmentLance(ctx, a)
        continue
      case 'clapBolt':
        drawClapBolt(ctx, a)
        continue
      case 'glaciateDome':
        drawGlaciateDome(ctx, a, t)
        continue
      case 'glaciateShatter':
        drawGlaciateShatter(ctx, a)
        continue
      case 'heatNova':
        drawHeatNova(ctx, a, t)
        continue
      case 'boulderLob':
        drawBoulderLob(ctx, a, false)
        continue
      case 'psyLift':
        drawLift(ctx, g, a, t)
        continue
      case 'aquaRunner':
        drawAquaRunner(ctx, g, a, t)
        continue
    }
    if (!visible(a.x, a.y, 120)) continue
    switch (a.visual) {
      case 'snowCrystal':
        drawCrystal(ctx, a, t)
        break
      case 'snowShatter':
        drawSnowShatter(ctx, a)
        break
      case 'terrainBolt':
        drawTerrainBolt(ctx, g, a)
        break
      case 'heatFeather':
        drawFeather(ctx, a, t)
        break
      case 'clapBurst':
        drawClapBurst(ctx, a)
        break
      case 'bulwarkShell':
        drawBulwarkShell(ctx, a, t)
        break
      case 'magmaGeyser':
        drawGeyser(ctx, a, t)
        break
      case 'boulderImpact':
        drawBoulderImpact(ctx, a, false)
        break
      case 'boulderRoll':
        drawBoulderRoll(ctx, a, t, false)
        break
      case 'ironShell':
        drawIronShell(ctx, a)
        break
      case 'steelShard':
        drawSteelShard(ctx, a, t)
        break
      case 'psySlam':
        drawPsySlam(ctx, a)
        break
      case 'judgmentWheel':
        drawJudgmentWheel(ctx, a, t)
        break
    }
  }
}
