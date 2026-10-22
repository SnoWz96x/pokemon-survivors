// Bundles the VPS relay into one file, dist/relay.mjs (ws included; node:sqlite is built in),
// so the image needs nothing but Node 24. Prints the bundle's hash: /health shows it as `version`.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const out = new URL('./dist/relay.mjs', import.meta.url).pathname

await build({
  entryPoints: [new URL('./src/main.ts', import.meta.url).pathname],
  outfile: out,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  // ws is CommonJS: its `require`s of Node's modules need one in an ES module.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  // ws's optional native speedups: not installed, ws falls back on its own.
  external: ['bufferutil', 'utf-8-validate'],
  sourcemap: 'inline',
  legalComments: 'none',
  logLevel: 'warning',
})

console.log(createHash('sha256').update(readFileSync(out)).digest('hex').slice(0, 16))
