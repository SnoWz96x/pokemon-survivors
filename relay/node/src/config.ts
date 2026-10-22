/** The São Paulo relay's settings, from its environment (`/etc/ps-relay/env` on the instance, written by each deploy). */
export type Config = {
  port: number
  host: string
  /** Where the rooms' and the dumps' SQLite files live. */
  dataDir: string
  /** The Clerk instance whose session tokens sign players in. */
  clerkIssuer: string
  /** Comma-separated origins the game is served from; `*` stands for one DNS label. */
  allowedOrigins: string
  /** Seat guests (no Clerk token): a dev stage and local runs only. */
  allowGuests: boolean
  /** Bearer token of `/admin/dumps`; null answers 404 there. */
  adminToken: string | null
  /** Behind CloudFront: the player's address is `CloudFront-Viewer-Address`. */
  trustProxy: boolean
  /** The deployed bundle's hash, shown by `/health` (a deploy is done when it changes). */
  version: string
}

export const configFrom = (env: Record<string, string | undefined>): Config => ({
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? '0.0.0.0',
  dataDir: env.DATA_DIR ?? '/var/lib/ps-relay',
  clerkIssuer: env.CLERK_ISSUER ?? 'https://clerk.pokemonsurvivors.com',
  allowedOrigins: env.ALLOWED_ORIGINS ?? 'https://www.pokemonsurvivors.com,https://pokemonsurvivors.com',
  allowGuests: env.ALLOW_GUESTS === 'on',
  adminToken: env.ADMIN_TOKEN || null,
  trustProxy: env.TRUST_PROXY === 'cloudfront',
  version: env.RELAY_VERSION ?? 'dev',
})
