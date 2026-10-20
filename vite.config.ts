import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig, runnerImport, type Plugin } from 'vite'

type Site = typeof import('./src/site/index.ts')

const SITE_ENTRY = '/src/site/index.ts'

/**
 * Static site pages (Pokédex, guide, changelog, legal) rendered from `src/site`.
 * In the build each page is a virtual HTML entry, so Vite bundles its CSS/JS and
 * writes `dist/<path>/index.html` with the content already in the markup. In dev
 * the same render runs per request (fresh after every edit). Also serves and
 * emits `sitemap.xml` from the route table.
 */
const sitePages = (): Plugin => {
  let site: Site | null = null
  let root = process.cwd()
  const pageFor = (id: string) => site?.SITE_PAGES.find((p) => resolve(root, p.file) === id)
  return {
    name: 'site-pages',
    enforce: 'pre',
    async config(config, { command }) {
      if (command !== 'build') return
      root = resolve(config.root ?? process.cwd())
      site = (await runnerImport<Site>(SITE_ENTRY, { configFile: false, root })).module
      return { build: { rolldownOptions: { input: Object.fromEntries(site.SITE_PAGES.map((p) => [p.path.slice(1, -1).replace(/\//g, '-'), p.file])) } } }
    },
    resolveId(id) {
      const file = resolve(root, id.replace(/^\//, ''))
      return pageFor(file) ? file : null
    },
    load(id) {
      return pageFor(id)?.render() ?? null
    },
    generateBundle() {
      if (site) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: site.sitemap() })
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '/').split(/[?#]/)[0] ?? '/'
        const dev = (await server.ssrLoadModule(SITE_ENTRY)) as Site
        if (path === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml')
          return res.end(dev.sitemap())
        }
        // Like Vercel's `trailingSlash: true`: /guia → /guia/
        const page = dev.SITE_PAGES.find((p) => p.path === path || p.path === `${path}/`)
        if (!page) return next()
        if (page.path !== path) {
          res.statusCode = 308
          res.setHeader('Location', page.path)
          return res.end()
        }
        res.setHeader('Content-Type', 'text/html')
        res.end(await server.transformIndexHtml(path, page.render(), req.originalUrl))
      })
    },
  }
}

/** The commit being built (Vercel says which; locally, git), for `__GAME_VERSION__`. */
const gameVersion = () => {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// One page per language for the game (index.html, en/index.html, es/index.html); the site pages are added by `sitePages`.
export default defineConfig({
  plugins: [sitePages()],
  // The co-op relay (`relay/`) is its own package with its own Workers test runner.
  test: { exclude: ['**/node_modules/**', '**/.git/**', 'relay/**'] },
  define: { __GAME_VERSION__: JSON.stringify(gameVersion()) },
  // PostHog's proxy, as vercel.json has it, to try analytics locally (`ps:analytics` set to `on` in localStorage).
  server: { proxy: { '/ingest': { target: 'https://us.i.posthog.com', changeOrigin: true, rewrite: (path) => path.replace(/^\/ingest/, '') } } },
  build: {
    // Hidden source maps, for `scripts/sourcemaps.mjs` to upload to PostHog, only where it will.
    sourcemap: process.env.POSTHOG_CLI_API_KEY ? 'hidden' : false,
    rolldownOptions: {
      input: { main: 'index.html', en: 'en/index.html', es: 'es/index.html' },
    },
  },
})
