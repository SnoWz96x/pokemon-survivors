/**
 * The co-op build id: a hash of the simulation's source, so the relay pins a
 * room to the simulation it runs and not to the whole app. Pedro deploys many
 * times a day; a UI, site or copy change keeps the same id, and a reload after
 * it rejoins the room. Only a change to a module the co-op simulation imports
 * (directly or through others) splits rooms.
 *
 * `vite.config.ts` computes it at build time (`__SIM_BUILD__`): it walks the
 * imports from `SIM_ROOTS` (relative ones only; the simulation uses no
 * packages), hashes every module's path and text in sorted order, plus
 * `RULES_VERSION` and `PROTOCOL`. Pure: the file reader is passed in, so the
 * vitest test runs it on made-up files.
 */

/** Where the co-op simulation starts: the lockstep step, the snapshots, and what the netcode feeds them. */
export const SIM_ROOTS = ['src/game/lockstep.ts', 'src/game/snapshot.ts', 'src/game/coop.ts', 'src/coop/entries.ts', 'src/coop/start.ts', 'src/net/protocol.ts'] as const

/** Import specifiers in a module's text: static imports and re-exports, side-effect imports and dynamic `import()`. */
export const importsOf = (text: string): string[] => {
  const out: string[] = []
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1]!)
  return out
}

const normalize = (path: string) => {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return parts.join('/')
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))

/** The file a relative specifier names, trying the extensions TypeScript would. Null for packages or files that don't exist. */
export const resolveImport = (from: string, spec: string, exists: (path: string) => boolean): string | null => {
  if (!spec.startsWith('.')) return null
  const base = normalize(`${dirOf(from)}/${spec}`)
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) if (exists(candidate) && /\.(ts|json)$/.test(candidate)) return candidate
  return null
}

/** Every module reachable from `roots` through relative imports, sorted. */
export const simModules = (roots: readonly string[], read: (path: string) => string | null): string[] => {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const path = queue.pop()!
    if (seen.has(path)) continue
    const text = read(path)
    if (text === null) continue
    seen.add(path)
    if (!path.endsWith('.ts')) continue
    for (const spec of importsOf(text)) {
      const next = resolveImport(path, spec, (p) => read(p) !== null)
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  return [...seen].sort()
}

/** 64-bit FNV-1a over a string's UTF-16 units (two 32-bit lanes), as 16 hex characters. */
export const fnv64 = (text: string) => {
  let a = 0x811c9dc5
  let b = 0xcbf29ce4
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c ^ (a >>> 7), 0x01000193)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

/** The build id of the simulation in these modules (`sim-` and 16 hex characters, within the relay's 40). */
export const simBuildId = (roots: readonly string[], read: (path: string) => string | null, extra: { rules: number; protocol: number }) => {
  const modules = simModules(roots, read)
  const parts = modules.map((path) => `${path}\n${read(path)}\n`)
  return { id: `sim-${fnv64(`rules ${extra.rules}\nprotocol ${extra.protocol}\n${parts.join('\u0000')}`)}`, modules }
}
