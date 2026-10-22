import type { GameEvent } from '../game/types'

/**
 * Each co-op screen's own shake, shell state only. The simulation keeps one
 * `g.shake` for the whole team: every teammate's hit taken and move landing
 * shook every screen at full strength however far away, and the draw rolled a
 * new offset at every display refresh (120 Hz on a ProMotion screen). Here a
 * screen shakes for what its player did (`own`), for what the whole team
 * watches (`team`) and for a spot in the world on its screen (`spot`), as
 * the simulation tells it (`shakeScreen`'s `shake` events); it fades as the
 * simulation's does, and the offset is rolled once per tick of the run.
 */

export type ScreenShake = {
  /** Its strength now (px). */
  amount: number
  /** The run's tick the offset was rolled at. */
  tick: number
  /** The offset to draw the world at (whole px). */
  x: number
  y: number
}

/** A shake fades this much a second, as the simulation's (`updateEffects`). */
const FADE = 18

/** A spot this far (px) past the screen's edge still shakes it: a slam just off screen is felt. */
const EDGE = 24

/** A tick's `shake` event (`shakeScreen`) and the slot acting when it was pushed (`Runner.actors`). */
export type ShakeEvent = Extract<GameEvent, { kind: 'shake' }> & { actor: number }

export const createScreenShake = (): ScreenShake => ({ amount: 0, tick: -1, x: 0, y: 0 })

/**
 * A tick's shake reaches this screen when it's this client's player's own
 * (`slot`), the team's, or at a spot on the world drawn (`camera`, `view`).
 */
export const feelShake = (s: ScreenShake, e: ShakeEvent, slot: number, camera: { x: number; y: number }, view: { w: number; h: number }) => {
  const here =
    e.from === 'team' ||
    (e.from === 'own' && e.actor === slot) ||
    (e.from === 'spot' && e.x >= camera.x - EDGE && e.x <= camera.x + view.w + EDGE && e.y >= camera.y - EDGE && e.y <= camera.y + view.h + EDGE)
  if (here) s.amount = Math.max(s.amount, e.amount)
}

/**
 * One display frame of `dt` s, with the run at `tick`: the shake fades, and
 * the offset is rolled again (`roll`, 0..1) only when the run stepped since,
 * so a 120 Hz display doesn't shake twice as fast as a 60 Hz one, and a frame
 * drawn between ticks keeps its offset. Same spread as the solo draw's.
 */
export const settleShake = (s: ScreenShake, dt: number, tick: number, roll: () => number) => {
  s.amount = Math.max(0, s.amount - dt * FADE)
  if (s.amount === 0) {
    s.x = s.y = 0
    return
  }
  if (tick === s.tick) return
  s.tick = tick
  s.x = Math.round((roll() - 0.5) * s.amount * 2)
  s.y = Math.round((roll() - 0.5) * s.amount * 2)
}
