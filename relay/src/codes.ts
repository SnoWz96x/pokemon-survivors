import type { Gen } from './room'
import { PROTOCOL, REGIONS, RELAY_HOMES, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type CreateResponse, type Region, type RelayHome } from '../../src/net/protocol'

/**
 * What both relay shells (the Cloudflare Worker and the São Paulo Node server)
 * say the same way about making a room: its code, the `POST /rooms` body and
 * the randomness the room asks for.
 */

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Uniform picks from `alphabet` (rejection sampling over random bytes). */
const draw = (alphabet: string, count: number, random: (n: number) => Uint8Array) => {
  const n = alphabet.length
  const limit = 256 - (256 % n)
  let out = ''
  while (out.length < count) for (const b of random(8)) if (b < limit && out.length < count) out += alphabet[b % n]
  return out
}

/** A uniformly random room code of `home` (its first character says which relay, `RELAY_HOMES`). */
export const randomCode = (home: RelayHome, random: (n: number) => Uint8Array = randomBytes) =>
  draw(RELAY_HOMES[home], 1, random) + draw(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH - 1, random)

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A `POST /rooms` body (`CreateRequest`, at most 1 KB of JSON), or the error and status to answer. */
export const parseCreate = (text: string): { build: string; region: Region } | { error: Extract<CreateResponse, { error: string }>['error']; status: number } => {
  let body: unknown = null
  try {
    body = text.length <= 1024 ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!isRecord(body)) return { error: 'invalid', status: 400 }
  if (body.v !== PROTOCOL) return { error: 'version', status: 426 }
  const build = typeof body.build === 'string' && /^[\w.-]{1,40}$/.test(body.build) ? body.build : null
  if (!build) return { error: 'invalid', status: 400 }
  return { build, region: REGIONS.find((r) => r === body.region) ?? 'auto' }
}

/** `bytes` random bytes in base64url (seat secrets, dump ids). */
export const randomToken = (bytes: number) => {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The room's randomness (`Gen`): seat secrets and run seeds. */
export const gen: Gen = { secret: () => randomToken(24), seed: () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0 }
