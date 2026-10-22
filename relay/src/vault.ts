import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { RETENTION, type DumpInfo, type DumpKind } from './store'

export { RETENTION, type DumpInfo, type DumpKind }

/** Bytes per stored part (SQLite rows hold 2 MB at most). */
const PART_BYTES = 1_500_000

/**
 * Finished runs kept for the lab (their own budget, apart from the dumps): at most `perDay` a UTC day,
 * the laggiest when more come (`score`), none older than `days`.
 */
export const LAB_RUNS = { perDay: 20, days: 14 } as const

const DAY_MS = 86_400_000

/** The start of `at`'s UTC day (ms). */
const dayStart = (at: number) => at - (at % DAY_MS)

/**
 * Desync dumps and the lab's kept runs, kept after their room is gone (for `RETENTION`, `LAB_RUNS`): one object
 * (`getByName('dumps')`) with its own SQLite. A class only because the Durable
 * Object runtime asks for one.
 */
export class Vault extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const sql = ctx.storage.sql
    sql.exec('CREATE TABLE IF NOT EXISTS dumps (id TEXT PRIMARY KEY, code TEXT NOT NULL, run INTEGER NOT NULL, tick INTEGER NOT NULL, at INTEGER NOT NULL, size INTEGER NOT NULL)')
    sql.exec('CREATE TABLE IF NOT EXISTS parts (id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, part)) WITHOUT ROWID')
    // Vaults made before kept runs: their dumps are all desyncs or bad snapshots.
    for (const column of ["kind TEXT NOT NULL DEFAULT 'desync'", 'score REAL NOT NULL DEFAULT 0']) {
      try {
        sql.exec(`ALTER TABLE dumps ADD COLUMN ${column}`)
      } catch {
        // The column is there already.
      }
    }
  }

  async put(info: DumpInfo, bytes: Uint8Array<ArrayBuffer>) {
    const sql = this.ctx.storage.sql
    sql.exec(
      'INSERT OR REPLACE INTO dumps (id, code, run, tick, at, size, kind, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      info.id, info.code, info.run, info.tick, info.at, info.size, info.kind, info.score,
    )
    // A dump put again (a kept run offered again) replaces all its parts.
    sql.exec('DELETE FROM parts WHERE id = ?', info.id)
    for (let i = 0; i * PART_BYTES < bytes.byteLength; i++) {
      sql.exec('INSERT OR REPLACE INTO parts (id, part, data) VALUES (?, ?, ?)', info.id, i, bytes.slice(i * PART_BYTES, (i + 1) * PART_BYTES).buffer)
    }
    // Past the day's places, the least laggy run of the day goes.
    if (info.kind === 'run') this.drop(`SELECT id FROM dumps WHERE kind = 'run' AND at >= ? ORDER BY score DESC, at DESC LIMIT -1 OFFSET ?`, dayStart(info.at), LAB_RUNS.perDay)
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DAY_MS)
  }

  /** Whether a finished run this laggy (`score`) would take one of today's places: asked before its log is packed. */
  async wantsRun(score: number): Promise<boolean> {
    const rows = this.ctx.storage.sql.exec<{ score: number }>("SELECT score FROM dumps WHERE kind = 'run' AND at >= ? ORDER BY score DESC", dayStart(Date.now())).toArray()
    return rows.length < LAB_RUNS.perDay || score > (rows.at(-1)?.score ?? 0)
  }

  /** Deletes the dumps (and their parts) the query `ids` selects. */
  private drop(ids: string, ...args: (string | number)[]) {
    const sql = this.ctx.storage.sql
    sql.exec(`DELETE FROM parts WHERE id IN (${ids})`, ...args)
    sql.exec(`DELETE FROM dumps WHERE id IN (${ids})`, ...args)
  }

  /** Drops dumps past `RETENTION` and kept runs past `LAB_RUNS` (too old, or past the newest `max`), and comes back tomorrow while any are left. */
  async alarm() {
    const now = Date.now()
    this.drop("SELECT id FROM dumps WHERE kind <> 'run' AND (at < ? OR id NOT IN (SELECT id FROM dumps WHERE kind <> 'run' ORDER BY at DESC LIMIT ?))", now - RETENTION.days * DAY_MS, RETENTION.max)
    this.drop("SELECT id FROM dumps WHERE kind = 'run' AND at < ?", now - LAB_RUNS.days * DAY_MS)
    const left = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM dumps').one().n
    if (left > 0) await this.ctx.storage.setAlarm(now + DAY_MS)
  }

  async list(limit: number): Promise<DumpInfo[]> {
    return this.ctx.storage.sql.exec<DumpInfo>('SELECT id, code, run, tick, at, size, kind, score FROM dumps ORDER BY at DESC LIMIT ?', limit).toArray()
  }

  /** A dump's gzipped JSON, or null. */
  async get(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const parts = this.ctx.storage.sql.exec<{ data: ArrayBuffer }>('SELECT data FROM parts WHERE id = ? ORDER BY part', id).toArray()
    if (parts.length === 0) return null
    const out = new Uint8Array(parts.reduce((n, p) => n + p.data.byteLength, 0))
    let at = 0
    for (const p of parts) {
      out.set(new Uint8Array(p.data), at)
      at += p.data.byteLength
    }
    return out
  }
}
