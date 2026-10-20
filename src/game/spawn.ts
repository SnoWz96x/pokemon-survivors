import { NO_BONUS } from './kitRules'
import { createModState, stampMods } from './mods'
import type { Attack, Game } from './types'

type AttackInit = Pick<Attack, 'move' | 'type' | 'visual' | 'x' | 'y' | 'shape' | 'motion' | 'damage' | 'ttl'> & Partial<Attack>

/**
 * Creates a hitbox with sensible defaults. A negative `age` delays the attack:
 * it stays dormant (invisible, harmless) until its age crosses zero. It
 * carries the mods of the move being cast, if any (`Player.castMods`), and
 * belongs to the player acting (`Attack.owner`).
 */
export const spawnAttack = (g: Game, init: AttackInit) => {
  const attack: Attack = {
    id: g.nextId++,
    owner: g.player.slot,
    knockback: 0,
    pierce: Infinity,
    hitInterval: Infinity,
    hits: new Map(),
    age: 0,
    activeFrom: 0,
    activeUntil: Infinity,
    grow: 0,
    status: null,
    from: { x: init.x, y: init.y },
    flip: false,
    blast: 0,
    blastVisual: init.visual,
    turret: null,
    mod: createModState(g.player.castMods),
    bonus: NO_BONUS,
    execute: 0,
    drain: 0,
    pull: 0,
    trailer: null,
    sure: false,
    blind: 0,
    tier: 0,
    ignoreWards: false,
    memo: 0,
    ...init,
  }
  if (attack.mod) stampMods(attack)
  g.attacks.push(attack)
  return attack
}
