import { describe, expect, it } from 'vitest'
import { importsOf, simBuildId, simModules } from './simBuild'

const files = (over: Record<string, string> = {}): ((path: string) => string | null) => {
  const all: Record<string, string> = {
    'src/game/lockstep.ts': "import { a } from './a'\nimport type { T } from '../data/t'\nexport const x = 1",
    'src/game/a.ts': "export * from '../engine/m'\nconst late = () => import('./lazy')",
    'src/game/lazy.ts': 'export {}',
    'src/data/t.ts': "import table from './table.json'\nexport type T = typeof table",
    'src/data/table.json': '{"hp": 1}',
    'src/engine/m.ts': "import 'some-package'\nexport const m = 2",
    'src/ui/hud.ts': "import { x } from '../game/lockstep'",
    ...over,
  }
  return (path) => all[path] ?? null
}

const ROOTS = ['src/game/lockstep.ts']
const EXTRA = { rules: 21, protocol: 2 }

describe('the simulation build id', () => {
  it('reads every kind of import specifier', () => {
    expect(importsOf("import a from './a'\nexport { b } from \"./b\"\nimport './c'\nawait import('./d')")).toEqual(['./a', './b', './c', './d'])
  })

  it('follows the imports from the roots, json included, and nothing that only imports the simulation', () => {
    expect(simModules(ROOTS, files())).toEqual(['src/data/t.ts', 'src/data/table.json', 'src/engine/m.ts', 'src/game/a.ts', 'src/game/lazy.ts', 'src/game/lockstep.ts'])
  })

  it('changes with the simulation and its rules, not with the UI', () => {
    const base = simBuildId(ROOTS, files(), EXTRA).id
    expect(base).toMatch(/^sim-[0-9a-f]{16}$/)
    expect(simBuildId(ROOTS, files({ 'src/ui/hud.ts': '// a new HUD' }), EXTRA).id).toBe(base)
    expect(simBuildId(ROOTS, files({ 'src/data/table.json': '{"hp": 2}' }), EXTRA).id).not.toBe(base)
    expect(simBuildId(ROOTS, files({ 'src/game/lazy.ts': 'export const y = 1' }), EXTRA).id).not.toBe(base)
    expect(simBuildId(ROOTS, files(), { ...EXTRA, rules: 22 }).id).not.toBe(base)
    expect(simBuildId(ROOTS, files(), { ...EXTRA, protocol: 3 }).id).not.toBe(base)
  })

  it('is what the build defines', () => {
    expect(__SIM_BUILD__).toMatch(/^sim-[0-9a-f]{16}$/)
  })
})
