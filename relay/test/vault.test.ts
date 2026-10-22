import { runDurableObjectAlarm } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { LAB_RUNS, RETENTION } from '../src/vault'

const DAY = 86_400_000

describe('vault', () => {
  it('prunes dumps past their retention on its alarm', async () => {
    const vault = env.VAULT.getByName('prune-test')
    const now = Date.now()
    const put = (id: string, at: number) => vault.put({ id, code: 'ABCDE', run: 1, tick: 600, at, size: 4, kind: 'desync', score: 0 }, new Uint8Array([1, 2, 3, 4]))
    await put('old', now - (RETENTION.days + 1) * DAY)
    await put('new', now)
    expect(await runDurableObjectAlarm(vault)).toBe(true)
    expect((await vault.list(10)).map((d) => d.id)).toEqual(['new'])
    expect(await vault.get('old')).toBeNull()
  })

  it('keeps the laggiest finished runs of the day, apart from the dumps', async () => {
    const vault = env.VAULT.getByName('lab-test')
    const now = Date.now()
    const run = (id: string, score: number) => vault.put({ id, code: 'ABCDE', run: 1, tick: 3600, at: now, size: 1, kind: 'run', score }, new Uint8Array([1]))
    await vault.put({ id: 'desync', code: 'ABCDE', run: 1, tick: 600, at: now, size: 1, kind: 'desync', score: 0 }, new Uint8Array([1]))
    for (let i = 0; i < LAB_RUNS.perDay; i++) await run(`r${i}`, 100 + i)
    expect(await vault.wantsRun(100)).toBe(false)
    expect(await vault.wantsRun(500)).toBe(true)
    await run('laggy', 500)
    const kept = await vault.list(100)
    expect(kept.filter((d) => d.kind === 'run')).toHaveLength(LAB_RUNS.perDay)
    expect(kept.map((d) => d.id)).toEqual(expect.arrayContaining(['laggy', 'desync']))
    expect(kept.map((d) => d.id)).not.toContain('r0')
    expect(await vault.get('r0')).toBeNull()
    // Offered again as it went on: the newer log replaces it whole.
    await vault.put({ id: 'laggy', code: 'ABCDE', run: 1, tick: 7200, at: now, size: 2, kind: 'run', score: 500 }, new Uint8Array([7, 8]))
    expect(await vault.get('laggy')).toEqual(new Uint8Array([7, 8]))
  })
})
