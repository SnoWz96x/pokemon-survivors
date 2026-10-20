/** Local dev servers of the game, always allowed. */
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

/** The patterns of a comma-separated origin list, `*` matching one DNS label. */
export const originPatterns = (list: string): RegExp[] =>
  list
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => new RegExp(`^${o.split('*').map(escape).join('[a-z0-9-]+')}$`))

/** Whether the game at `origin` may use the relay (WebSocket `Origin`, CORS, a Clerk token's `azp`). */
export const allowedOrigin = (env: { ALLOWED_ORIGINS: string }, origin: string) =>
  LOCALHOST.test(origin) || originPatterns(env.ALLOWED_ORIGINS).some((p) => p.test(origin))
