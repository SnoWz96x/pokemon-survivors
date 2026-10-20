import { beforeAll, describe, expect, it } from 'vitest'
import { LEEWAY_S, jwksKeys, verifyClerkToken, type VerifyOptions } from '../src/auth'

const ISSUER = 'https://clerk.example.com'
const NOW = 1_800_000_000_000

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enc = (v: object) => b64url(new TextEncoder().encode(JSON.stringify(v)))

let keys: CryptoKeyPair
let options: VerifyOptions

const sign = async (claims: Record<string, unknown>, kid = 'k1', key = keys.privateKey) => {
  const head = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)))
  return `${head}.${b64url(sig)}`
}

const claims = (over: Record<string, unknown> = {}) => ({ sub: 'user_1', iss: ISSUER, azp: 'https://game.example', exp: NOW / 1000 + 60, nbf: NOW / 1000 - 5, ...over })

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', keys.publicKey)) as JsonWebKey
  const lookup = jwksKeys('https://jwks', async () => Response.json({ keys: [{ kid: 'k1', kty: 'RSA', n: jwk.n, e: jwk.e }] }))
  options = { keys: lookup, issuer: ISSUER, allowedParty: (o) => o === 'https://game.example', now: NOW }
})

describe('Clerk tokens', () => {
  it('accepts a valid token, and one expired within the clock-skew leeway', async () => {
    expect(await verifyClerkToken(await sign(claims()), options)).toBe('user_1')
    expect(await verifyClerkToken(await sign(claims({ exp: NOW / 1000 - LEEWAY_S + 1 })), options)).toBe('user_1')
  })

  it('refuses expired, not-yet-valid, foreign or tampered tokens', async () => {
    expect(await verifyClerkToken(await sign(claims({ exp: NOW / 1000 - LEEWAY_S - 1 })), options)).toBeNull()
    expect(await verifyClerkToken(await sign(claims({ nbf: NOW / 1000 + LEEWAY_S + 1 })), options)).toBeNull()
    expect(await verifyClerkToken(await sign(claims({ iss: 'https://evil.example' })), options)).toBeNull()
    expect(await verifyClerkToken(await sign(claims({ azp: 'https://evil.example' })), options)).toBeNull()
    expect(await verifyClerkToken(await sign(claims(), 'unknown'), options)).toBeNull()
    const [h, , s] = (await sign(claims())).split('.')
    expect(await verifyClerkToken(`${h}.${enc(claims({ sub: 'user_2' }))}.${s}`, options)).toBeNull()
  })
})
