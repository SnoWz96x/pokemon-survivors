import { blitCentered, blitEllipse, type PixelSprite } from '../engine/pixelart'
import type { Vec } from '../engine/math'
import { ESCORT, FIELD_TUNING, NEST, TOGEPI_DEX, type FieldMissionKind } from '../game/fieldMissionRules'
import type { MissionEvent } from '../game/fieldMissions'
import type { MapEventOf } from '../game/mapEvents'
import type { Game } from '../game/types'
import { art, lazy, PICKUPS, SPARKLE, toIconUrl } from './art'
import { drawPokemon, loadedSprites } from './sprites'
import { dashedRing } from './strokes'
import { HURT_TINT } from './flashes'
import { localPlayer } from '../game/players'

/**
 * Field missions on the ground (the nest and its egg, the lost Poké Balls,
 * Togepi and its nest) and what their off-screen arrows point at.
 */

type Ctx = CanvasRenderingContext2D

const EGG = [
  '...111...', '..12221..', '.1242231.', '.1243321.', '122223321', '123322221',
  '133322331', '122222331', '.1222221.', '..11111..',
]
const HEART = ['.11.11.', '1221221', '1222221', '.12221.', '..121..', '...1...']

const ART = lazy(() => ({
  egg: art(EGG, { 1: '#a89878', 2: '#f8f0d8', 3: '#58b848', 4: '#ffffff' }, '#282018'),
  heart: art(HEART, { 1: '#902848', 2: '#f878a8' }, '#181818'),
}))

export const eggIcon = () => toIconUrl('missionEgg', () => ART().egg)
export const heartIcon = () => toIconUrl('missionHeart', () => ART().heart)

/** A twig nest: dark rim, straw bed and a few sticks poking out. */
const nest = (ctx: Ctx, x: number, y: number, r: number) => {
  blitEllipse(ctx, r, Math.round(r * 0.45), '#583818', x, y)
  blitEllipse(ctx, r - 2, Math.round(r * 0.45) - 1, '#a87838', x, y)
  blitEllipse(ctx, r - 5, Math.max(1, Math.round(r * 0.45) - 3), '#c8a058', x, y)
  ctx.fillStyle = '#583818'
  for (const [ox, oy] of [[-r + 1, -2], [r - 3, -1], [-4, -Math.round(r * 0.45)], [5, Math.round(r * 0.45) - 1]] as const) ctx.fillRect(Math.round(x + ox), Math.round(y + oy), 3, 1)
}

/** A tiny HP bar `w` px wide centered over (x, y): green, then yellow and red as it drops. */
const hpBar = (ctx: Ctx, x: number, y: number, k: number, w = 18) => {
  const left = Math.round(x - w / 2)
  const top = Math.round(y)
  ctx.fillStyle = '#181818'
  ctx.fillRect(left - 1, top - 1, w + 2, 4)
  ctx.fillStyle = '#483038'
  ctx.fillRect(left, top, w, 2)
  ctx.fillStyle = k > 0.5 ? '#58d858' : k > 0.25 ? '#f8c830' : '#f04030'
  ctx.fillRect(left, top, Math.max(0, Math.round(w * k)), 2)
}

/** Pixel arc of `k` (0..1) of a ring, clockwise from the top. */
const arc = (ctx: Ctx, x: number, y: number, r: number, k: number, color: string) => {
  const steps = Math.ceil(r * Math.PI * 3)
  ctx.fillStyle = color
  for (let i = 0; i <= steps * k; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI * 2
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2)
  }
}

const drawDefense = (ctx: Ctx, g: Game, ev: MapEventOf<'defense'>, t: number) => {
  const s = ev.state
  const hp = s.hp / FIELD_TUNING[g.difficulty].defense.hp
  // The ring blinks red while the player is away from a nest under attack.
  const away = s.started && !s.inside && Math.floor(t * 4) % 2 === 0
  dashedRing(ctx, ev.x, ev.y, NEST.radius, t * 1.2, away ? ['#f04030', '#801818'] : ['#78d878', '#287828'], 0.35)
  if (s.progress > 0) arc(ctx, ev.x, ev.y, NEST.radius, s.progress, '#d8f8c8')
  nest(ctx, ev.x, ev.y + 2, 13)
  const egg = ART().egg
  const wobble = s.flash > 0 ? Math.round(Math.sin(t * 60)) : Math.floor(t * 1.5 + ev.id) % 5 === 0 ? 1 : 0
  ctx.drawImage(egg, Math.round(ev.x - egg.width / 2 + wobble), Math.round(ev.y - egg.height + 2))
  if (s.started) hpBar(ctx, ev.x, ev.y - egg.height - 4, hp)
  else if ((t + ev.id * 0.3) % 1.4 < 0.2) blitCentered(ctx, SPARKLE()[1]!, ev.x + 6, ev.y - egg.height)
}

const drawCollect = (ctx: Ctx, ev: MapEventOf<'collect'>, t: number) => {
  const ball = PICKUPS.pokeball()
  for (const [i, b] of ev.state.balls.entries()) {
    if (b.got) continue
    const bob = Math.round(Math.sin(t * 4 + i) * 1.5)
    blitEllipse(ctx, 5, 2, 'rgba(16,40,16,0.3)', b.x, b.y)
    dashedRing(ctx, b.x, b.y - 2, 9, t * 2 + i, ['#f83838', '#ffffff'], 0.4)
    blitCentered(ctx, ball, b.x, b.y - 5 + bob)
    if ((t + i * 0.37) % 1.2 < 0.18) blitCentered(ctx, SPARKLE()[1]!, b.x + 5, b.y - 11)
  }
}

const drawEscort = (ctx: Ctx, g: Game, ev: MapEventOf<'escort'>, t: number, calm: boolean) => {
  const s = ev.state
  // Its nest, with a heart over it once Togepi is on the way.
  dashedRing(ctx, s.home.x, s.home.y, ESCORT.arrive + 4, t, ['#f878a8', '#ffffff'], 0.3)
  nest(ctx, s.home.x, s.home.y, 12)
  if (s.following && ev.gone < 0) blitCentered(ctx, ART().heart, s.home.x, s.home.y - 14 + Math.round(Math.sin(t * 3) * 1.5))
  const sprites = loadedSprites(TOGEPI_DEX)
  if (!sprites) return
  blitEllipse(ctx, 5, 2, 'rgba(16,40,16,0.3)', ev.x, ev.y)
  drawPokemon(ctx, sprites, s.flash > 0 ? 'Hurt' : s.moving ? 'Walk' : 'Idle', s.dir, ev.age, ev.x, ev.y, {
    flash: s.flash > 0.1 && !calm ? 0.6 : 0,
    tint: s.flash > 0.1 && calm ? HURT_TINT : undefined,
  })
  if (ev.gone >= 0) return
  hpBar(ctx, ev.x, ev.y - sprites.bodyH - 6, s.hp / FIELD_TUNING[g.difficulty].escort.hp, 14)
  // Lost and calling: a blinking heart until the player comes close.
  if (!s.following && Math.floor(t * 2) % 2 === 0) blitCentered(ctx, ART().heart, ev.x + 8, ev.y - sprites.bodyH - 4)
}

/** Draws a field mission's ground layer. `calm` (Flashes: reduced) tints a hurt Togepi instead of flashing it white. */
export const drawFieldMission = (ctx: Ctx, g: Game, ev: MissionEvent, t: number, calm: boolean) => {
  switch (ev.kind) {
    case 'defense': return drawDefense(ctx, g, ev, t)
    case 'collect': return drawCollect(ctx, ev, t)
    case 'escort': return drawEscort(ctx, g, ev, t, calm)
  }
}

/** Where a mission's arrow points: the nearest ball left, Togepi's nest once it follows, else the event. */
export const missionSpot = (g: Game, ev: MissionEvent): Vec => {
  if (ev.kind === 'collect') {
    const p = localPlayer(g)
    let best: Vec = ev
    let d = Infinity
    for (const b of ev.state.balls) {
      const d2 = (b.x - p.x) ** 2 + (b.y - p.y) ** 2
      if (!b.got && d2 < d) {
        d = d2
        best = b
      }
    }
    return best
  }
  if (ev.kind === 'escort') return ev.state.following ? ev.state.home : ev
  return ev
}

/** Icon in a mission's arrow. */
export const missionIcon = (kind: FieldMissionKind): PixelSprite => (kind === 'defense' ? ART().egg : kind === 'collect' ? PICKUPS.pokeball() : ART().heart)
