import { decodeSnapshot, snapshot } from './snapshot'
import type { Game } from './types'

/**
 * Where two game states differ, as readable lines (`enemies#812.x: 101.25 ≠
 * 101.25000000000001 (Δ 1.4e-14, bits 4059500000000000 ≠ 4059500000000001)`).
 * The tool for desyncs: decode both peers' snapshots (`decodeSnapshot`) and
 * diff them. Arrays of things with an `id` (enemies, attacks, pickups…) are
 * matched by id, so one foe more on one side reads as that foe, not as every
 * later index shifted. Tooling only; no game code depends on it.
 */

export type DiffOptions = {
  /** Lines to report at most (the walk stops there). */
  limit?: number
}

const bits = (v: number) => {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, v)
  return view.getBigUint64(0).toString(16).padStart(16, '0')
}

const show = (v: unknown): string => {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'function') return 'rng'
  if (v instanceof Map) return `Map(${v.size})`
  if (v instanceof Set) return `Set(${v.size})`
  if (Array.isArray(v)) return `[${v.length}]`
  if (typeof v === 'object' && v !== null) {
    const text = JSON.stringify(v, (_, x: unknown) => (x instanceof Map ? `Map(${x.size})` : x instanceof Set ? `Set(${x.size})` : x))
    return text.length > 120 ? `${text.slice(0, 117)}...` : text
  }
  return String(v)
}

const kind = (v: unknown) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof Map ? 'map' : v instanceof Set ? 'set' : typeof v

const idOf = (v: unknown): number | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'id' in v && typeof v.id === 'number' ? v.id : null

/** Whether an array holds things with unique ids, so it diffs by id. */
const byId = (a: readonly unknown[]) => {
  if (a.length === 0) return null
  const ids = new Map<number, unknown>()
  for (const x of a) {
    const id = idOf(x)
    if (id === null || ids.has(id)) return null
    ids.set(id, x)
  }
  return ids
}

/** The differences between `a` and `b`, one line each, up to `limit`. Empty when they're the same. */
export const diffStates = (a: unknown, b: unknown, options: DiffOptions = {}): string[] => {
  const limit = options.limit ?? 40
  const out: string[] = []
  const visited = new Set<unknown>()
  const report = (line: string) => {
    if (out.length < limit) out.push(line)
  }

  const walk = (x: unknown, y: unknown, path: string): void => {
    if (out.length >= limit) return
    if (typeof x === 'number' && typeof y === 'number') {
      if (Object.is(x, y)) return
      const delta = Number.isFinite(x) && Number.isFinite(y) ? `, Δ ${(y - x).toPrecision(3)}` : ''
      return report(`${path}: ${show(x)} ≠ ${show(y)} (bits ${bits(x)} ≠ ${bits(y)}${delta})`)
    }
    if (typeof x === 'function' && typeof y === 'function') {
      return walk('state' in x ? x.state : null, 'state' in y ? y.state : null, `${path}.state`)
    }
    if (kind(x) !== kind(y)) return report(`${path}: ${show(x)} ≠ ${show(y)}`)
    if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) {
      if (x !== y) report(`${path}: ${show(x)} ≠ ${show(y)}`)
      return
    }
    // Shared objects are compared once, where they are first met.
    if (visited.has(x)) return
    visited.add(x)
    if (Array.isArray(x) && Array.isArray(y)) {
      const ix = byId(x)
      const iy = ix && byId(y)
      if (ix && iy) {
        if (x.length !== y.length) report(`${path}.length: ${x.length} ≠ ${y.length}`)
        for (const [id, v] of ix) {
          if (!iy.has(id)) report(`${path}#${id}: only on the left: ${show(v)}`)
        }
        for (const [id, v] of iy) {
          if (!ix.has(id)) report(`${path}#${id}: only on the right: ${show(v)}`)
        }
        const order = (ids: Map<number, unknown>) => [...ids.keys()].filter((id) => ix.has(id) && iy.has(id)).join()
        if (order(ix) !== order(iy)) report(`${path}: the same ids in another order`)
        for (const [id, v] of ix) if (iy.has(id)) walk(v, iy.get(id), `${path}#${id}`)
        return
      }
      if (x.length !== y.length) report(`${path}.length: ${x.length} ≠ ${y.length}`)
      for (let i = 0; i < Math.min(x.length, y.length); i++) walk(x[i], y[i], `${path}[${i}]`)
      return
    }
    if (x instanceof Map && y instanceof Map) {
      if (x.size !== y.size) report(`${path}.size: ${x.size} ≠ ${y.size}`)
      for (const [k, v] of x) {
        if (!y.has(k)) report(`${path}<${show(k)}>: only on the left: ${show(v)}`)
        else walk(v, y.get(k), `${path}<${show(k)}>`)
      }
      for (const [k, v] of y) if (!x.has(k)) report(`${path}<${show(k)}>: only on the right: ${show(v)}`)
      if (out.length < limit && x.size === y.size && [...x.keys()].some((k, i) => k !== [...y.keys()][i])) report(`${path}: the same keys in another order`)
      return
    }
    if (x instanceof Set && y instanceof Set) {
      for (const v of x) if (!y.has(v)) report(`${path}{${show(v)}}: only on the left`)
      for (const v of y) if (!x.has(v)) report(`${path}{${show(v)}}: only on the right`)
      if (out.length < limit && x.size === y.size && [...x].some((v, i) => v !== [...y][i])) report(`${path}: the same members in another order`)
      return
    }
    const ox = x as Record<string, unknown>
    const oy = y as Record<string, unknown>
    const kx = Object.keys(ox)
    const ky = Object.keys(oy)
    for (const k of kx) {
      const p = path ? `${path}.${k}` : k
      if (!(k in oy)) report(`${p}: only on the left: ${show(ox[k])}`)
      else walk(ox[k], oy[k], p)
    }
    for (const k of ky) if (!(k in ox)) report(`${path ? `${path}.${k}` : k}: only on the right: ${show(oy[k])}`)
    if (out.length < limit && kx.length === ky.length && kx.join() !== ky.join() && kx.every((k) => k in oy)) report(`${path || '(root)'}: the same keys in another order`)
  }

  walk(a, b, '')
  return out
}

/** Where two games differ in what their snapshots hold (caches left out, as `snapshot` leaves them). */
export const diffGames = (a: Game, b: Game, options: DiffOptions = {}) =>
  diffStates(decodeSnapshot(snapshot(a)).state, decodeSnapshot(snapshot(b)).state, options)
