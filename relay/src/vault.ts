import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

export type DumpInfo = { id: string; code: string; run: number; tick: number; at: number; size: number }

/** Bytes per stored part (SQLite rows hold 2 MB at most). */
const PART_BYTES = 1_500_000

/**
 * Desync dumps, kept after their room is gone: one object (`getByName('dumps')`)
 * with its own SQLite. A class only because the Durable Object runtime asks for one.
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

  /** For `/health`: a real read of this object's storage. */
  async ping(): Promise<{ dumps: number }> {
    return { dumps: this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM dumps').one().n }
  }
}
