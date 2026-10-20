/**
 * Clerk session tokens, verified with WebCrypto: RS256 against the instance's
 * JWKS (cached per isolate), `iss`, `exp`/`nbf` with some clock-skew leeway,
 * and `azp` (the page the token was minted for) when present.
 */

/** Seconds of clock skew allowed on `exp` and `nbf`. Clerk tokens live 60 s and are checked once, at `hello`. */
export const LEEWAY_S = 60

/** JWKS kept this long before a refetch; an unknown `kid` refetches at most once per `refetch`. */
const JWKS_TTL_MS = 60 * 60_000
const JWKS_REFETCH_MS = 60_000
/** A JWKS fetch that takes longer is given up (the hello waiting on it is refused, and the next one tries again). */
const JWKS_TIMEOUT_MS = 5000

export type KeyLookup = (kid: string) => Promise<CryptoKey | null>

export type VerifyOptions = {
  keys: KeyLookup
  issuer: string
  /** Whether a token's `azp` (an origin) may sign in here. */
  allowedParty: (origin: string) => boolean
  /** Now, in ms. */
  now: number
}

const decoder = new TextDecoder()

const fromBase64Url = (s: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const jsonPart = (s: string): Record<string, unknown> | null => {
  const bytes = fromBase64Url(s)
  if (!bytes) return null
  try {
    const v: unknown = JSON.parse(decoder.decode(bytes))
    return isRecord(v) ? v : null
  } catch {
    return null
  }
}

/** The Clerk user id (`sub`) of a valid session token, or null. */
export const verifyClerkToken = async (token: string, o: VerifyOptions): Promise<string | null> => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts as [string, string, string]
  const header = jsonPart(h)
  const claims = jsonPart(p)
  const signature = fromBase64Url(s)
  if (!header || !claims || !signature || header.alg !== 'RS256' || typeof header.kid !== 'string') return null
  const key = await o.keys(header.kid)
  if (!key) return null
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${h}.${p}`))
  if (!ok) return null
  const nowS = o.now / 1000
  const { sub, exp, nbf, iss, azp } = claims
  if (typeof sub !== 'string' || sub.length === 0 || typeof exp !== 'number' || exp + LEEWAY_S < nowS) return null
  if (typeof nbf === 'number' && nbf - LEEWAY_S > nowS) return null
  if (iss !== o.issuer) return null
  if (azp !== undefined && (typeof azp !== 'string' || !o.allowedParty(azp))) return null
  return sub
}

type Jwk = { kid: string; kty: string; n: string; e: string }

const isJwk = (v: unknown): v is Jwk =>
  isRecord(v) && typeof v.kid === 'string' && v.kty === 'RSA' && typeof v.n === 'string' && typeof v.e === 'string'

/**
 * Keys from a JWKS URL, cached: refetched after an hour, or when a token names
 * a `kid` we don't have (Clerk rotated its keys), at most once a minute.
 */
export const jwksKeys = (url: string, fetcher: (url: string) => Promise<Response> = (u) => fetch(u, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) })): KeyLookup => {
  let keys = new Map<string, CryptoKey>()
  let fetchedAt = -Infinity
  let inflight: Promise<void> | null = null
  const refresh = (now: number) => {
    inflight ??= (async () => {
      try {
        const res = await fetcher(url)
        const body: unknown = res.ok ? await res.json() : null
        const list = isRecord(body) && Array.isArray(body.keys) ? body.keys.filter(isJwk) : []
        const next = new Map<string, CryptoKey>()
        for (const k of list) {
          const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
          next.set(k.kid, key)
        }
        if (next.size > 0) keys = next
        fetchedAt = now
      } catch {
        fetchedAt = now
      } finally {
        inflight = null
      }
    })()
    return inflight
  }
  return async (kid) => {
    const now = Date.now()
    if (now - fetchedAt > JWKS_TTL_MS || (!keys.has(kid) && now - fetchedAt > JWKS_REFETCH_MS)) await refresh(now)
    return keys.get(kid) ?? null
  }
}
