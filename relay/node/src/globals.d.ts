import type { webcrypto } from 'node:crypto'

declare global {
  /** Node's types declare `CryptoKey` only as a value; the shared `auth.ts` names it as a type, as the Workers types do. */
  type CryptoKey = webcrypto.CryptoKey
}

export {}
