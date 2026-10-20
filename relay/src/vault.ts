import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

export type DumpInfo = { id: string; code: string; run: number; tick: number; at: number; size: number }

/** Bytes per stored part (SQLite rows hold 2 MB at most). */
const PART_BYTES = 1_500_000

/** Dumps kept: the newest `max`, none older than `days`. Pruned by the vault's alarm, once a day while it holds any. */
export const RETENTION = { days: 30, max: 500 } as const

const DAY_MS = 86_400_000

/**
 * Desync dumps, kept after their room is gone (for `RETENTION`): one object
 * (`getByName('dumps')`) with its own SQLite. A class only because the Durable
 * Object runtime asks for one.
 */
export class Vault extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const sql = ctx.storage.sql
    sql.exec('CREATE TABLE IF NOT EXISTS dumps (id TEXT PRIMARY KEY, code TEXT NOT NULL, run INTEGER NOT NULL, tick INTEGER NOT NULL, at INTEGER NOT NULL, size INTEGER NOT NULL)')
    sql.exec('CREATE TABLE IF NOT EXISTS parts (id TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (id, part)) WITHOUT ROWID')
  }

  async put(info: DumpInfo, bytes: Uint8Array<ArrayBuffer>) {
    const sql = this.ctx.storage.sql
    sql.exec('INSERT OR REPLACE INTO dumps (id, code, run, tick, at, size) VALUES (?, ?, ?, ?, ?, ?)', info.id, info.code, info.run, info.tick, info.at, info.size)
    for (let i = 0; i * PART_BYTES < bytes.byteLength; i++) {
      sql.exec('INSERT OR REPLACE INTO parts (id, part, data) VALUES (?, ?, ?)', info.id, i, bytes.slice(i * PART_BYTES, (i + 1) * PART_BYTES).buffer)
    }
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + DAY_MS)
  }

  /** Drops dumps past `RETENTION` (too old, or past the newest `max`), and comes back tomorrow while any are left. */
  async alarm() {
    const sql = this.ctx.storage.sql
    const stale = 'SELECT id FROM dumps WHERE at < ? OR id NOT IN (SELECT id FROM dumps ORDER BY at DESC LIMIT ?)'
    const args = [Date.now() - RETENTION.days * DAY_MS, RETENTION.max] as const
    sql.exec(`DELETE FROM parts WHERE id IN (${stale})`, ...args)
    sql.exec(`DELETE FROM dumps WHERE id IN (${stale})`, ...args)
    const left = sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM dumps').one().n
    if (left > 0) await this.ctx.storage.setAlarm(Date.now() + DAY_MS)
  }

  async list(limit: number): Promise<DumpInfo[]> {
    return this.ctx.storage.sql.exec<DumpInfo>('SELECT id, code, run, tick, at, size FROM dumps ORDER BY at DESC LIMIT ?', limit).toArray()
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
