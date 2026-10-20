import { accountHandle, sessionToken } from './account'
import { track } from './analytics'
import { bank, bankKey, paysAnything, type BankDelta, type Store } from './coop/bank'
import { createBot, botPick, type Bot } from './coop/bot'
import { createCoopClient, webSocket, type CoopClient, type CoopDeps } from './coop/client'
import { EGGS } from './game/eggs'
import { coopPayout, playerDexLog } from './game/coop'
import { mergeDex, recordRun, type Pokedex } from './game/dex'
import { localPlayer } from './game/players'
import type { Game, GameEvent } from './game/types'
import { ROOM_PARAM, parseRoomCode } from './net/protocol'
import { bankEggs, depositPokeDollars, recordRunProgress, updateSave } from './ui/save'

/**
 * The browser's side of co-op that isn't drawing: the one client of this tab
 * (relay URL, Clerk token or guest id, localStorage), joining by link, the
 * banking of a run (exactly once, `coop/bank.ts`), which events of the
 * simulation are this player's, and the dev console's bots.
 */

/** The dev relay on workers.dev: dev builds use it unless `VITE_COOP_URL` (or `ps.coop('url', …)`) says otherwise. */
export const DEV_RELAY = 'https://ps-coop-dev.pedrobarretto.workers.dev'

const URL_KEY = 'ps:coopUrl'
const NAME_KEY = 'ps:coopName'

const local: Store = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      // Storage blocked: the seat lasts this page.
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      // Nothing kept.
    }
  },
  keys: () => {
    try {
      return Object.keys(localStorage)
    } catch {
      return []
    }
  },
}

/** Where the relay is: the build's, a dev override, or the dev relay in dev builds. Null: co-op is off in this build. */
export const coopUrl = (): string | null => (import.meta.env.DEV ? local.get(URL_KEY) : null) ?? import.meta.env.VITE_COOP_URL ?? (import.meta.env.DEV ? DEV_RELAY : null)

export const setCoopUrl = (url: string | null) => (url ? local.set(URL_KEY, url) : local.remove(URL_KEY))

/**
 * The name teammates see: the account's @handle (unique, the one the boards
 * show; co-op is for signed-in players). Only dev builds, whose relay seats
 * guests, fall back to a name kept on the device; bots bring their own.
 */
export const coopName = () => {
  const handle = accountHandle()
  if (handle) return `@${handle}`
  // No handle yet (the shell asks for one before co-op): never shown in practice.
  if (!import.meta.env.DEV) return '?'
  const kept = local.get(NAME_KEY)
  if (kept) return kept
  const name = `Dev ${Math.floor(1000 + Math.random() * 9000)}`
  local.set(NAME_KEY, name)
  return name
}

const browserDeps = (url: string, store: Store, token: () => Promise<string | null>, name: () => string): CoopDeps => ({
  url,
  build: __SIM_BUILD__,
  socket: webSocket,
  fetch: (u, init) => fetch(u, init),
  store,
  token,
  name,
  now: () => performance.now(),
  random: Math.random,
})

let client: CoopClient | null = null

/** This tab's co-op client (made on first use), or null without a relay. */
export const coopClient = (): CoopClient | null => {
  const url = coopUrl()
  if (!url) return null
  client ??= createCoopClient(browserDeps(url, local, sessionToken, coopName))
  return client
}

/** The room code in the page's link (`?sala=K7QF2`), if any. */
export const linkedRoom = () => parseRoomCode(new URLSearchParams(location.search).get(ROOM_PARAM))

/** Puts the room in the page's link, so a reload or the shared link comes back to it. */
export const linkRoom = (code: string | null) => {
  const u = new URL(location.href)
  if (code) u.searchParams.set(ROOM_PARAM, code)
  else u.searchParams.delete(ROOM_PARAM)
  history.replaceState(null, '', u)
}

/**
 * Banks this player's share of the run now (a victory, the end, leaving):
 * what wasn't paid yet, never twice, even across reloads. `dexBase` is the
 * Pokédex as the run found it.
 */
export const bankCoopRun = (g: Game, room: string, run: number, slot: number, withBonus: boolean, dexBase: Pokedex): BankDelta =>
  bank(local, bankKey(room, run), coopPayout(g, slot), withBonus, (d) => {
    if (d.coins > 0) depositPokeDollars(d.coins)
    if (d.steps > 0 || d.eggs.length > 0) bankEggs(d.steps, d.eggs.slice(0, EGGS.perRun))
    if (paysAnything(d) || d.before === null) recordRunProgress(d.summary, d.before, Math.max(0, EGGS.perRun - g.eggs.found.length))
    // Their own Pokémon's forms only count as caught (`playerDexLog`), not the teammates'.
    updateSave((save) => ({ ...save, dex: mergeDex(save.dex, recordRun(dexBase, playerDexLog(g, slot))) }))
  })

/** Reports a heal to PostHog: when, where and how long it took. */
export const reportHeal = (room: string, tick: number, ms: number) => track('coop_heal', { room, tick, ms: Math.round(ms) })

/** Events that are one player's own: only their client shows and plays them (the runner notes who pushed each). */
const PERSONAL: ReadonlySet<GameEvent['kind']> = new Set<GameEvent['kind']>([
  'cast', 'moveSound', 'heal', 'hurt', 'special', 'stance', 'megaChoice', 'megaStone', 'megaStart', 'mega', 'megaEnd', 'megaReady',
  'shinyPlayer', 'evolve', 'branchChoice', 'ability', 'evolved', 'moveEvolved', 'duoFused', 'curse', 'pokeball', 'shinyOffer',
  'tm', 'tmLearned', 'tmMastered', 'banish', 'consumable', 'revive', 'riftFall', 'guard',
  'evoItem', 'evoHeld', 'maxRevive', 'stolen', 'awaken', 'awakened',
])

/** Events solo banks into the save that co-op never shows: a legendary's defeat counting toward its capture (solo's progression, `COOP_LOCKS`). */
const SOLO_ONLY: ReadonlySet<GameEvent['kind']> = new Set<GameEvent['kind']>(['legendBeaten'])

/**
 * Whether an event of the simulation is this client's to see and hear: the
 * world's (a boss, the biome, the level-up the team shares) are everyone's;
 * a player's own (`PERSONAL`) only theirs, by `actor`, the slot acting when
 * the game pushed it.
 */
export const coopEventFor = (g: Game, e: GameEvent, actor: number) => !SOLO_ONLY.has(e.kind) && (!PERSONAL.has(e.kind) || actor === localPlayer(g).slot)

/** Dev: bots in this tab, each a full client of its own (its own socket, game and guest id). */
const bots: Bot[] = []
let botLoop: number | null = null

const memoryStore = (): Store => {
  const data = new Map<string, string>()
  return { get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k), keys: () => [...data.keys()] }
}

/** Dev: `n` bots join room `code` (they set a loadout and get ready; the soak's bots in a tab). */
export const addBots = async (code: string, n: number) => {
  const url = coopUrl()
  if (!url) return []
  const joined: number[] = []
  for (let i = 0; i < n; i++) {
    const k = bots.length
    const bot = createBot(browserDeps(url, memoryStore(), async () => null, () => `Bot ${k + 1}`), { seed: 7 + k * 31, vote: false })
    bots.push(bot)
    const res = await bot.client.join(code)
    if (!res.ok) continue
    bot.client.setLoadout(botPick(k + 1))
    setTimeout(() => bot.client.setReady(true), 300)
    // After a run the relay clears everyone's ready: a bot is ready for "Jogar de novo" a moment later.
    bot.client.on((e) => {
      const seat = bot.client.state().seat
      if (e.kind === 'room' && e.room.phase === 'ended' && e.room.members.some((m) => m.seat === seat && !m.ready)) setTimeout(() => bot.client.setReady(true), 800)
    })
    joined.push(res.seat)
  }
  if (botLoop === null) {
    let last = performance.now()
    botLoop = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      for (const b of bots) b.frame(dt)
    }, 16)
  }
  return joined
}

export const removeBots = () => {
  for (const b of bots.splice(0)) b.client.leave()
  if (botLoop !== null) clearInterval(botLoop)
  botLoop = null
}

export const botCount = () => bots.length

/** Dev: the tab's bots stop kiting and walk into the horde (staging a faint, a revive, the team's wipe). */
export const surrenderBots = () => {
  for (const b of bots) b.surrender()
  return bots.length
}

