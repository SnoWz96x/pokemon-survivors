import { setLocalSlot } from '../game/players'
import type { Attack, Enemy, Game, Player } from '../game/types'
import type { GhostLook } from './predict'
import type { Runner } from './runner'

/**
 * What the shell draws in co-op: a copy of the confirmed game, never the game
 * itself. The copy (made fresh into the same objects every frame, so
 * screens holding it see it live) has
 * - this client as "the player" (`g.player`, `localPlayer`), drawn where the
 *   prediction puts it, with its hitboxes glued to it (auras, orbits) moved along;
 * - the drawn camera around it (or where a legendary's scene pans its screen;
 *   the shell's team camera, `render/teamCamera.ts`, moves it to a teammate
 *   while this player lies fainted) and the shell's own view size, while the
 *   simulation keeps its fixed view (`COOP.view`) for everyone;
 * - teammates and enemies between the last two ticks (`alpha`), so the world
 *   moves at the display's rate, 60 or 120 Hz, without stepping in jumps;
 * - each teammate as their own copy (`mates`), for the renderer to draw them.
 * Nothing in the simulation's state is written.
 */

export type DrawView = {
  game: Game
  mates: Game[]
  mateGames: Game[]
  players: Player[]
  mateLists: Player[][]
  enemies: Enemy[]
  attacks: Attack[]
  /** Copies by slot and by id (a copy only ever stands for the same thing, so no stale field leaks from another). */
  pool: { players: Player[]; enemies: Map<number, Enemy>; attacks: Map<number, Attack> }
  camera: { x: number; y: number }
}

export const createDrawView = (g: Game): DrawView => ({
  game: { ...g },
  mates: [],
  mateGames: [],
  players: [],
  mateLists: [],
  enemies: [],
  attacks: [],
  pool: { players: [], enemies: new Map(), attacks: new Map() },
  camera: { x: 0, y: 0 },
})

/** Teleport-sized moves between two ticks (a spawn, a dash, a rift) draw at once. */
const FAR = 24 * 24

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Hitboxes that ride on their caster: they follow the drawn player, not the confirmed one. */
const glued = (a: Attack) => a.motion.kind === 'follow' || a.motion.kind === 'orbit' || a.motion.kind === 'lunge' || a.motion.kind === 'roll'

/**
 * Refreshes the draw view from the runner's game: `me` is where this player
 * is drawn, `view` the canvas size (world px), `alpha` how far real time is
 * past the last tick (0..1), `look` the predicted player's facing and
 * special (`Prediction.look`), so a turn or a press shows at once. Returns
 * the game copy to draw and show.
 */
export const updateDrawView = (dv: DrawView, r: Runner, me: { x: number; y: number }, view: { w: number; h: number }, alpha: number, look: GhostLook | null = null): Game => {
  const g = r.game
  const k = Math.max(0, Math.min(1, alpha))
  const before = r.before
  const pool = dv.pool
  const players = dv.players
  players.length = g.players.length
  g.players.forEach((p, i) => {
    const copy = Object.assign((pool.players[i] ??= { ...p }), p)
    if (i === r.slot) {
      copy.x = me.x
      copy.y = me.y
      if (look) Object.assign(copy, look)
    } else {
      const b = before.players[i]
      if (b && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < FAR) {
        copy.x = lerp(b.x, p.x, k)
        copy.y = lerp(b.y, p.y, k)
      }
    }
    players[i] = copy
  })
  setLocalSlot(players, r.slot)
  const enemies = dv.enemies
  enemies.length = g.enemies.length
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i]!
    let copy = pool.enemies.get(e.id)
    if (copy) Object.assign(copy, e)
    else pool.enemies.set(e.id, (copy = { ...e }))
    const bx = before.ex.get(e.id)
    const by = before.ey.get(e.id)
    if (bx !== undefined && by !== undefined && (e.x - bx) ** 2 + (e.y - by) ** 2 < FAR) {
      copy.x = lerp(bx, e.x, k)
      copy.y = lerp(by, e.y, k)
    }
    enemies[i] = copy
  }
  if (pool.enemies.size > 2 * g.enemies.length + 64) {
    const alive = new Set(g.enemies.map((e) => e.id))
    for (const id of pool.enemies.keys()) if (!alive.has(id)) pool.enemies.delete(id)
  }
  // This player's glued hitboxes move with the drawn sprite.
  const own = g.players[r.slot]!
  const dx = me.x - own.x
  const dy = me.y - own.y
  let attacks = g.attacks
  if (dx !== 0 || dy !== 0) {
    attacks = dv.attacks
    attacks.length = g.attacks.length
    for (let i = 0; i < g.attacks.length; i++) {
      const a = g.attacks[i]!
      if (a.owner !== r.slot || !glued(a)) {
        attacks[i] = a
        continue
      }
      let copy = pool.attacks.get(a.id)
      if (copy) Object.assign(copy, a)
      else pool.attacks.set(a.id, (copy = { ...a }))
      copy.x = a.x + dx
      copy.y = a.y + dy
      attacks[i] = copy
    }
    if (pool.attacks.size > 256) pool.attacks.clear()
  }
  // A wave legendary's entrance or capture pans every screen itself (the world held): frame what this player's screen frames.
  const cx = g.legendScene ? own.screen.x + g.view.w / 2 : me.x
  const cy = g.legendScene ? own.screen.y + 10 + g.view.h / 2 : me.y
  dv.camera.x = cx - view.w / 2
  dv.camera.y = cy - 10 - view.h / 2
  const game = Object.assign(dv.game, g, { players, player: players[r.slot]!, enemies, attacks, camera: dv.camera, view })
  // Each teammate as their own copy: the renderer draws "the player" of it.
  let n = 0
  players.forEach((p, i) => {
    if (i === r.slot) return
    const list = (dv.mateLists[i] ??= [])
    list.length = 0
    list.push(...players)
    setLocalSlot(list, i)
    dv.mates[n++] = Object.assign((dv.mateGames[i] ??= { ...game }), game, { players: list, player: p })
  })
  dv.mates.length = n
  return game
}
