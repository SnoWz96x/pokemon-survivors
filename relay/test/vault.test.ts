import { runDurableObjectAlarm } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { RETENTION } from '../src/vault'

const DAY = 86_400_000

describe('vault', () => {
  it('prunes dumps past their retention on its alarm', async () => {
    const vault = env.VAULT.getByName('prune-test')
    const now = Date.now()
    const put = (id: string, at: number) => vault.put({ id, code: 'ABCDE', run: 1, tick: 600, at, size: 4 }, new Uint8Array([1, 2, 3, 4]))
    await put('old', now - (RETENTION.days + 1) * DAY)
    await put('new', now)
    expect(await runDurableObjectAlarm(vault)).toBe(true)
    expect((await vault.list(10)).map((d) => d.id)).toEqual(['new'])
    expect(await vault.get('old')).toBeNull()
  })
})
