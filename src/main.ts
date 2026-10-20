import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import './ui/style.css'
// First, so its error listeners catch what goes wrong while the rest loads.
import { bugReportsEnabled, describeWith, deviceMemory, syncRunWatch, takeCrash } from './bugReport'
import type { BugCrash, BugPerf } from './game/bugReport'

import { playCry, playSfx, unlockAudio, type Sfx } from './engine/audio'
import { castSound } from './ui/castSounds'
import { createInput, type Stick } from './engine/input'
import type { Vec } from './engine/math'
import { currentTheme, duckMusic, playTheme, type ThemeId } from './engine/music'
import { advancePacer, pacer, resetPacer } from './engine/pacing'
import { canvasStats, context2d, resetCanvases, resetCanvasPeaks } from './engine/pixelart'
import { frameStats, recentFrameMs, recordFrame, resetRunFrames, runFrames } from './engine/frameStats'
import { fitView } from './engine/viewport'
import { createRng } from './engine/rng'
import { BIOME_ORDER, BIOMES, type BiomeId, type WeatherId } from './data/biomes'
import { bodyOf } from './data/bodies'
import { MEGA_LINES, MEGAS, megasOf, type MegaId } from './data/megas'
import { isRiftLegend } from './data/rifts'
import { domainTheme } from './game/domain'
import { partnerOf } from './data/domains'
import { captureOutcome, setCaptureOutcome } from './render/capture'
import { captureOutcome as savedCapture } from './game/capture'
import { domainLines } from './ui/riftTitle'
import { isWaveLegend, LEGEND_THEME } from './data/legendBosses'
import { ENEMIES, type EnemyDef, type EnemyId } from './data/enemies'
import { ITEMS } from './data/items'
import type { AchievementId } from './data/achievements'
import type { TraitId } from './data/traits'
import { REGIONS, STARTERS } from './data/starters'
import { nextIsOfficial } from './game/attempt'
import { challengeStart, type Challenge } from './game/challenge'
import { HATCHLING_IDS, HATCHLINGS, PLAYABLE, PLAYABLE_IDS, type HatchlingId, type PlayableId } from './data/hatchlings'
import { isLegend } from './data/legends'
import { accountHandle, accountState, accountsEnabled, accountUserId, backFromSignIn, giftInbox, onAccountChange, stageGifts, stageSyncedSave, startAccount, syncSave } from './account'
import { identify, startAnalytics, track, type ErrorContext } from './analytics'
import { BAG_ITEMS, useArmed, type BagItem } from './game/bag'
import { armedTms, tmLimit } from './game/tmShelf'
import { branchNeeds, capLevel } from './game/evoItems'
import { runEvoItems } from './game/evoGate'
import { EVO_ITEM_IDS, EVO_ITEMS, SHOP_LEVEL_IDS, SHOP_LEVELS, type EvoItemId } from './data/shop'
import { shopIcon, tmPicture } from './ui/shopIcons'
import { CONSUMABLES } from './game/consumables'
import { depositEggs, EGG_TIERS, EGGS, freeSlots, grantEgg, hatchEgg, isReady, toSteps, type EggTier, type Hatch } from './game/eggs'
import { setBiome } from './game/biomes'
import { addCandies, HAUNT_DEX, recordHunt } from './game/halloween'
import { HALLOWEEN, isNightBoss, NIGHT_BOSSES } from './data/halloween'
import { jackIcon, treatIcon } from './render/halloweenArt'
import { brasiliaDay, previousDay, type DayKey } from './game/day'
import { spawnEnemy } from './game/enemies'
import { pickAlpha, spawnAlpha } from './game/alphas'
import { EVENTS, stageIndexAt } from './data/waves'
import { makeShiny } from './game/shiny'
import { MAP_EVENT_KINDS, MAP_EVENTS, spawnMapEvent, type MapEventKind } from './game/mapEvents'
import { MEOWTH_DEX } from './game/mapEventRules'
import { FIELD, FIELD_MISSION_KINDS, TOGEPI_DEX, type FieldMissionKind } from './game/fieldMissionRules'
import { advancePhase, banishOffer, chooseOffer, offerAbilities, playerDex, rerollOffers, skipLevelUp, step, takeBerryLevelUps } from './game/game'
import { formAt, playerForm } from './game/branch'
import { unlockedAt } from './game/learnsets'
import { ABILITIES, type AbilityEffect, type AbilityId } from './data/abilities'
import { branchesAt, familyDex, MEGA_BRANCH, type BranchId } from './data/branches'
import { abilityStacks, grantAbility } from './game/abilities'
import { abilityIcon } from './render/abilityArt'
import { recomputeStats, xpFor } from './game/leveling'
import { dropMegaStones, grantStone, heldMega, megaBaseName } from './game/mega'
import { REAPER } from './game/endless'
import { continueEndless } from './game/endlessSystem'
import { levelUpDevTools } from './game/levelUpDev'
import { legendDevTools } from './game/legendDev'
import { bankCapture, captureDevTools, showCapture } from './ui/capture'
import { riftDevTools } from './game/riftDev'
import { placeDevTools } from './game/placeDev'
import { placeFeedback } from './ui/places'
import { landmarkFeedback } from './ui/landmarks'
import { PLACES } from './data/places'
import { kitDevTools } from './game/kitDev'
import { eggMoveDevTools } from './game/eggMovesDev'
import { learnDevTools } from './game/learnDev'
import { tmDevTools } from './game/tmDev'
import { evoGateDevTools } from './game/evoGateDev'
import { duoDevTools } from './game/duoDev'
import { tensionDevTools } from './game/tensionDev'
import { hazardDevTools } from './game/hazardDev'
import { spitterDevTools } from './game/spitterDev'
import { cursePick } from './ui/cursePick'
import { pokeballPick } from './ui/pokeballPick'
import { dropPickup } from './game/pickups'
import { CURSES } from './data/curses'
import { CAST_SFX } from './ui/castSfx'
import { clearSpot, featureAt, featuresNear, inSolid } from './game/terrain'
import { TERRAIN, type SolidKind } from './data/terrain'
import type { LandmarkId } from './data/landmarks'
import { dexNews, dexStatus, mergeDex, recordRun, type Pokedex } from './game/dex'
import { runEarnings, wonRun, type ConvertedEggs } from './game/meta'
import { missionStatus, type MissionStatus } from './game/missions'
import { summarizeRun, type RunSummary } from './game/tally'
import { parseHandle, rankable, runMode, runResult } from './game/ranking'
import { rosterSchedule, type Roster } from './game/roster'
import { parseReplay, recordEvent, recordStep, resimulate, RULES_VERSION, rulesStanding, runRoster, startGame, startRecording, TICK, type Recorder, type ReplayStart } from './game/replay'
import { gameSpecial } from './game/special'
import { unlockShinyStarter } from './game/shinyStarters'
import { playsShiny } from './game/shinyPicks'
import { canWalkWith, companionForm, isSupporter, SUPPORTER_TIERS, TIER_GIFTS, type CompanionId, type SupporterTier } from './game/supporters'
import { createCompanion, stepCompanion, type CompanionView } from './render/companion'
import { MOVES } from './game/moves'
import type { Game, GameEvent, Offer, Phase, Player } from './game/types'
import { setWeather } from './game/weather'
import { render, warmScenery } from './render/draw'
import { createGovernor, detail, observeFrame } from './render/quality'
import { drawJoystick } from './render/joystick'
import { cryUrl, loadAll, loadedCount, loadSpecies, overlayStats, portraitUrl, preloadForms, preloadShinies, sprites, streamSpecies, sweepSprites, type Dex } from './render/sprites'
import { castNeeds, runSprites, type SpriteNeed } from './render/spriteNeeds'
import { setMarkerInsets } from './render/mapEvents'
import { consumableIcon } from './render/props'
import { berryIcon, curseIcon, eggIcon, moveIcon, ribbonIcon, warmIcon } from './render/art'
import { TYPE_COLORS } from './data/types'
import { megaStoneIcon } from './render/megaFx'
import { celebrateShop, createTitleScene, drawTitleScene, meetPartner, revealShopkeeper, sceneAt, steerPartner, stepTitleScene, talkSpot, tapsPlaza, visitPlaza } from './render/titleScene'
import { KECLEON_DEX, type ShopLevel } from './render/plaza'
import { weatherIcon } from './render/weather'
import { formatDay, formatPokeDollars, locale, LOCALES, t } from './i18n'
import { h, later, rich } from './ui/dom'
import { setActivePad } from './ui/inputLabels'
import { captureRef, flushRuns, onRulesBehind, prefetchRanked, PROFILE_PARAM, rankingEnabled, stageInvite, startRanked, type RankedRun, type RankOutcome } from './ranking'
import { DISCORD_GIFT, parseGiftContent, type GiftKind, type GiftReason } from './game/gifts'
import { giftScreen } from './ui/gifts'
import { playGate } from './ui/account'
import { trainerCardScreen } from './ui/trainer'
import { discordScreen } from './ui/discord'
import { createHud, type Hud } from './ui/hud'
import { bankEggs, challengeToday, depositPokeDollars, halloweenToday, loadAttempt, loadSave, outbreakToday, recordRunProgress, saveAttempt, saveHatch, setToday, today, updateSave, writeSave } from './ui/save'
import { challengeScreen, challengeShiny } from './ui/challenge'
import { hatchScene, incubator } from './ui/incubator'
import { medalChips, missionReport, missionsScreen, progressToast, titleBadge } from './ui/missions'
import { martDevTools } from './ui/martDev'
import { CARAVAN, STALL_IDS, STALLS, type StallId } from './data/visitors'
import { nextMilestone } from './game/loyalty'
import { plazaVisitors, setDevCaravan, setDevStall } from './ui/visitors'
import { missionDevTools } from './ui/missionsDev'
import { pcBoxScreen } from './ui/pcBox'
import { newsScreen } from './ui/news'
import { forgetSurvey, surveyScreen } from './ui/survey'
import { halloweenScreen } from './ui/halloween'
import { pokedexScreen } from './ui/pokedex'
import { profileEditor, profileScreen } from './ui/profile'
import { rankingScreen, rankPanel } from './ui/ranking'
import { flashScreen, levelUp, pauseMenu, results, textBox, type Screen } from './ui/screens'
import { abilityPick, branchPick } from './ui/abilityPick'
import { tmPick } from './ui/tmPick'
import { isSettingsOpen, openSettings, settings, toggleMute } from './ui/settings'
import { mapEventFeedback } from './ui/mapEvents'
import { runShare, sharePreview, trainerShare } from './ui/share'
import { shop, type ShopPlaza, type VisitorShelf } from './ui/shop'
import { starterSelect } from './ui/starterSelect'
import { invitesScreen } from './ui/invites'
import { titleScreen, type LobbyFocus, type Meadow, type ShopTrip } from './ui/title'
import { creditsLine, supportersScreen } from './ui/supporters'
import { suggestionsScreen } from './ui/suggestions'
import { banner, clearToasts, tickToasts, toast } from './ui/toasts'
import { bugReportForm, crashPrompt } from './ui/bugReport'
import { localPlayer, phaseOf } from './game/players'
import { addBots, bankCoopRun, botCount, coopClient, coopEventFor, coopUrl, linkedRoom, linkRoom, removeBots, reportHeal, setCoopUrl } from './coopShell'
import type { CoopClient } from './coop/client'
import { coopDriver, type CoopDriver } from './coop/driver'
import { createDrawView, updateDrawView, type DrawView } from './coop/view'
import { createPrediction, predict, type Prediction } from './coop/predict'
import type { Runner } from './coop/runner'
import { coopOver } from './game/coop'
import { onScreen, type PickScreen } from './game/lockstep'
import { coopEnd, createCoopHud, type CoopHud } from './ui/coopHud'

/** Fixed simulation step: the replays the ranking re-simulates count on it. */
const STEP = TICK

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const ui = document.querySelector<HTMLDivElement>('#ui')!
// A capture scene's ball clicks shut once the save holds the legend captured (its win is banked the frame it falls).
setCaptureOutcome((legend) => savedCapture(loadSave(), legend))
const ctx = context2d(canvas)
/** Invisible box CSS puts where the fixed joystick sits (corner, safe area); the stick is centered on it. */
const stickAnchor = h('div', { class: 'stick-anchor', 'aria-hidden': 'true' })
document.body.append(stickAnchor)
/** The anchor's center, measured once per layout (cleared on resize). */
let stickCenter: Vec | null = null
/** Mouse and keyboard: the fixed stick gives its corner to the WASD keys (`ui/movePad.ts`), and a touch on a touchscreen laptop floats. Same query as the CSS. */
const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
const fixedStickCenter = (): Vec | null => {
  if (settings().joystick !== 'fixed' || finePointer.matches) return null
  if (!stickCenter) {
    const r = stickAnchor.getBoundingClientRect()
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  return stickCenter
}
const input = createInput(canvas, () => settings().controls, fixedStickCenter)
/** Internal canvas size in world px. Shared by reference with the running game. */
const view = { w: 480, h: 270 }
/** CSS px per world px (integer in device px, see `fitView`). */
let cssScale = 4
/** Set when the canvas was cleared and must be redrawn even if the game is paused. */
let dirty = true

/**
 * Sizes the low-res canvas to the visible viewport. Runs on resize, rotation
 * and iOS toolbar changes (visualViewport), and only touches the canvas when
 * the result actually changed, because resizing clears it.
 */
const resize = () => {
  stickCenter = null
  // The HUD may have moved (a new viewport or UI size): re-measure it after layout (and after module init, so `run` exists by then).
  requestAnimationFrame(() => run && syncMarkerInsets())
  const width = window.visualViewport?.width ?? window.innerWidth
  const height = window.visualViewport?.height ?? window.innerHeight
  const fit = fitView(width, height, window.devicePixelRatio || 1)
  if (fit.w === view.w && fit.h === view.h && fit.cssScale === cssScale) return
  view.w = fit.w
  view.h = fit.h
  cssScale = fit.cssScale
  canvas.width = view.w
  canvas.height = view.h
  canvas.style.width = `${view.w * cssScale}px`
  canvas.style.height = `${view.h * cssScale}px`
  // One world pixel, for the UI's pixel frames (style.css turns it into #ui's zoomed px as `--px`).
  document.documentElement.style.setProperty('--world-px', `${Math.max(2, Math.round(cssScale))}px`)
  context2d(canvas)
  dirty = true
}
// Rotation often reports stale sizes in the same tick, so re-measure on the next frame too.
const scheduleResize = () => (resize(), requestAnimationFrame(resize))
window.addEventListener('resize', scheduleResize)
window.addEventListener('orientationchange', scheduleResize)
window.visualViewport?.addEventListener('resize', scheduleResize)
resize()
// After a GPU reset every canvas comes back blank, cached art included: redraw it all, settings too.
canvas.addEventListener('contextrestored', () => {
  resetCanvases()
  context2d(canvas)
  dirty = true
})

/* ---------------- App state ---------------- */

type Run = {
  game: Game
  hud: Hud
  overlay: Screen | null
  /** Phase + offers snapshot the overlay was built for. */
  shown: { phase: Phase; offers: Player['offers'] } | null
  closeText: (() => void) | null
  /** ₽ of this run already in the wallet: a victory banks right away and again if the run goes on endless. */
  paid: number
  /** Noite das Bruxas candies of this run already in the save's jar, banked the same way. */
  candies: number
  /** True once the run's end was reported to analytics. */
  reported: boolean
  /** Missions as the run started, and what the run has recorded so far (see `recordProgress`). */
  missionsBefore: MissionStatus[]
  recorded: RunSummary | null
  unlocked: AchievementId[]
  /** ₽ paid for missions and medals this run, and the reward eggs and bag items they gave. */
  reward: number
  rewardEggs: number
  rewardItems: BagItem[]
  /** Steps and eggs of this run already in the incubator. */
  hatchery: { steps: number; eggs: number }
  /** Eggs of this run (found or rewards) paid in ₽ because they didn't fit, for the results. */
  convertedEggs: ConvertedEggs
  /** The Pokédex as saved when the run began: banking folds the run's log into it, so banking twice changes nothing. */
  dexBase: Pokedex
  /** Everything the simulation took from the player, for the ranking to re-simulate (`game/replay.ts`). */
  recorder: Recorder
  /** Signed in: the run's start token and its result, once reported (see `rankRun`). */
  ranked: RankedRun | null
  rank: Promise<RankOutcome> | null
  /** The longest run on record before this one: beating it lights up the Share button. */
  bestBefore: number
  /**
   * A Desafio do dia run: its day, whether it started as the official attempt
   * (what the screen said; the API decides), and whether it's the attempt this
   * device keeps (`saveAttempt`). Null for any other run.
   */
  challenge: { day: DayKey; official: boolean; attempt: boolean } | null
  /** The supporter's companion walking along, drawn only (`render/companion.ts`). */
  companion: CompanionView | null
  /** Which sheets the run streams and keeps (`syncSprites`): its cast's windows, and what it keeps in every variant. */
  sprites: { needs: SpriteNeed[]; always: Dex[] }
  /** A co-op run: the client stepping it and what draws it (null solo). */
  coop: CoopRun | null
}

/**
 * The shell's side of a co-op run. `r.game` is the runner's (confirmed) game;
 * everything drawn and shown reads `view.game`, a copy with this player as
 * "the player" where prediction puts it (`coop/view.ts`).
 */
type CoopRun = {
  client: CoopClient
  runner: Runner
  view: DrawView
  prediction: Prediction
  hud: CoopHud
  /** What steps the run: the stick and buttons in, the lockstep out (`coop/driver.ts`, PR 7's UI drives it too). */
  driver: CoopDriver
  /** A pick sent on the screen of this round: the screen closes until the round moves on. */
  sent: number | null
  /** The pause menu is open (the run goes on; the stick reads still). */
  menu: boolean
  /** Banked at the victory and at the end (deltas; `coop/bank.ts` keeps it to once). */
  banked: { victory: boolean; over: boolean }
  /** The endless vote was cast. */
  voted: boolean
}

let screen: Screen | null = null
let run: Run | null = null
/** Special attack press (Space, touch button, gamepad A), consumed by the next simulation step. */
let specialQueued = false
/** Mega Evolution press (E, the Mega button, gamepad Y), consumed like the special. */
let megaQueued = false
/** Manual lunge press (Shift, the lunge button, gamepad X) for Quick Attack, consumed like the special. */
let lungeQueued = false
/** The meadow with wandering Pokémon behind every menu. Lives across screens, so it never pops. */
const scene = createTitleScene(Date.now())
/** The joystick a drag on the lobby's meadow steers the partner with, drawn over it. */
let meadowStick: Stick | null = null

/** A CSS px point on screen, in the meadow's world px (the canvas sits at the viewport's corner). */
const meadowAt = (at: Vec): Vec => ({ x: Math.round(scene.cam.x) + at.x / cssScale, y: Math.round(scene.cam.y) + at.y / cssScale })

/** A meadow point (world px) on screen, in CSS px. */
const meadowToScreen = (at: Vec): Vec => ({ x: (at.x - Math.round(scene.cam.x)) * cssScale, y: (at.y - Math.round(scene.cam.y)) * cssScale })

/** Lobbies that met the partner so far: only the latest one may send it away (the next title is built before the last one goes). */
let meetings = 0

/** The lobby's handle on the meadow: its partner walks there, with the supporter's companion, and visits the Kecleon plaza. */
const meadow: Meadow = {
  meet: (partner) => {
    const id = ++meetings
    meetPartner(scene, partner, runCompanion({ x: 0, y: 0 }))
    return () => void (id === meetings && meetPartner(scene, null))
  },
  steer: (move, tap, home) => steerPartner(scene, move, tap && meadowAt(tap), meadowAt(home)),
  out: () => scene.partner !== null && scene.partner.state !== 'home',
  stick: (stick) => (meadowStick = stick),
  visit: (to, instant) => {
    // 1 visit in 20 from afar, the counter looks empty: Kecleon is camouflaged until talked to (`ShopPlaza.reveal`).
    const offView = Math.abs(scene.plaza.x - (scene.cam.x + view.w / 2)) > view.w / 2 + 60
    scene.plaza.hidden = to === 'plaza' && (devSurprise || (offView && Math.random() < 1 / 20))
    devSurprise = false
    scene.plaza.focus = 0
    visitPlaza(scene, to, view.w, view.h, instant)
  },
  at: () => sceneAt(scene),
  talkSpot: () => {
    const at = talkSpot(scene)
    return at && { ...meadowToScreen(at), who: at.who }
  },
  tapsShop: (at) => tapsPlaza(scene, meadowAt(at)),
}

/** Dev: the plaza's building level (`ps.plaza(n)`), over the shop's own. */
let devPlazaLevel: ShopLevel | null = null
/** Dev: the next trip to the plaza finds the counter empty (`ps.surprise()`). */
let devSurprise = false
/** The save's shop level, read when the lobby opens and when the shop grows (not from storage every frame). */
let shopLevel: ShopLevel = loadSave().shop.level
/** The Kecleon plaza's level: the shop's expansion, or the dev's override. */
const plazaLevel = (): ShopLevel => devPlazaLevel ?? shopLevel

/** Whether the last run beat Mewtwo, for Kecleon's congratulations at the next visit (said once). */
let wonLastRun = false

/** The plaza as the shop's panel drives it: the camouflaged Kecleon, the building growing, the camera leaning to a shopkeeper. */
const shopPlaza: ShopPlaza = {
  hidden: () => scene.plaza.hidden,
  reveal: () => revealShopkeeper(scene),
  grew: (level) => {
    shopLevel = level
    devPlazaLevel = null
    celebrateShop(scene, level)
  },
  lookAt: (keeper) => (scene.plaza.focus = keeper === 'purple' ? 1 : keeper === 'meowth' ? 'caravan' : keeper === 'stall' ? 'stall' : 0),
}

/** Who comes by the plaza (Meowth's caravan, a seasonal stall, the golden statue), worked out from the save about once a second. */
let visitorsAt = -1
const refreshVisitors = (now: number) => {
  if (now - visitorsAt < 1000 && visitorsAt >= 0) return
  visitorsAt = now
  const next = plazaVisitors(loadSave())
  const was = scene.plaza.visitors
  if (next.caravan !== was.caravan || next.stall !== was.stall || next.statue !== was.statue) scene.plaza.visitors = next
}

/** The shop over the plaza; `close` leaves it (and `?loja` behind); `shelf` opens on Meowth's caravan or a seasonal stall's shelf. */
const openShop = (close: () => void, shelf?: VisitorShelf) => {
  const won = wonLastRun
  wonLastRun = false
  return shop(ui, input, {
    plaza: shopPlaza,
    wonLastRun: won,
    shelf,
    close: () => {
      if (new URLSearchParams(location.search).has(SHOP_PARAM)) history.replaceState(null, '', location.pathname)
      close()
    },
  })
}

const queueMega = () => {
  unlockAudio()
  if (run?.game.phase === 'playing') megaQueued = true
}

/** The player's name right now: its stage's, or its Mega form's while that lasts. */
const playerName = (g: Game) => (localPlayer(g).mega.active > 0 && heldMega(g)?.name) || playerForm(g).name

/** Classes every screen shares, which say nothing about which one it is. */
const SCREEN_CLASSES = new Set(['screen', 'shell', 'dim', 'pop', 'hidden'])

// A bug report says what's on screen: the screens stacked up (the form itself aside) and the run, as plain numbers.
/** Frame pacing, for the crash watch and the run's summary on `run_end`. */
const frames = frameStats()

const mb = (bytes: number) => Math.round(bytes / 104_857.6) / 10

/** Canvas memory and frame pace right now (`createCanvas` keeps the counts as it goes). */
const perfNow = (): BugPerf => ({
  canvases: canvasStats.live,
  canvasMb: mb(canvasStats.bytes),
  peakCanvases: canvasStats.peakLive,
  peakCanvasMb: mb(canvasStats.peakBytes),
  frameMs: recentFrameMs(frames),
})

describeWith(() => {
  const view = [...ui.querySelectorAll(':scope > .screen:not(.bug-screen)')].map((el) => [...el.classList].filter((c) => !SCREEN_CLASSES.has(c)).join('.')).join(' > ')
  const perf = perfNow()
  const g = run?.game
  if (!g || g.phase === 'gameover' || g.phase === 'victory') return { view, run: null, perf }
  const boss = g.bossId === null ? undefined : g.enemies.find((e) => e.id === g.bossId)
  return {
    view,
    perf,
    run: {
      partner: localPlayer(g).starter,
      form: playerName(g),
      difficulty: g.difficulty,
      time: Math.floor(g.time),
      level: localPlayer(g).level,
      phase: g.phase,
      biome: g.biome.id,
      enemies: g.enemies.length,
      projectiles: g.attacks.length + g.hazards.length,
      wave: EVENTS[g.nextEvent - 1]?.kind ?? '',
      boss: boss?.kind ?? '',
      place: g.rift.arena ? `rift:${g.rift.arena.legend}` : (g.place.inside?.id ?? ''),
    },
  }
})

/** The player's cry right now: its Mega form's own while that lasts. */
const playerCry = (g: Game) => cryUrl(playerDex(g), localPlayer(g).mega.active > 0 ? heldMega(g)?.form : undefined)

const queueSpecial = () => {
  unlockAudio()
  if (run?.game.phase === 'playing') specialQueued = true
}

const queueLunge = () => {
  unlockAudio()
  if (run?.game.phase === 'playing') lungeQueued = true
}

const setScreen = (next: Screen | null) => {
  screen?.dispose()
  screen = next
}

/** Set by the title's "press start": the music waits for it, even where the browser would autoplay. */
let pressedStart = false

/**
 * Title screen. `intro` shows the blinking "press start" first (boot, PWA launch, not back from signing in);
 * coming back from the starter select goes straight to the lobby. `focus` is what the lobby highlights (JOGAR by default).
 */
const showTitle = (opts: { intro?: boolean; focus?: LobbyFocus; shop?: ShopTrip; shelf?: VisitorShelf; instant?: boolean; back?: () => void } = {}) => {
  endRun()
  shopLevel = loadSave().shop.level
  // A newer build went live during the run (see `watchDeploys`): back in the lobby, with the run banked, ranked and its crash watch cleared, is the moment to load it.
  if (reloadForDeploy) return location.reload()
  // Every Play in the lobby (the partner select, the challenge, a hatch, a shiny pick) finds its ticket in hand.
  prefetchRun()
  prefetchRun(challengeToday().day)
  setScreen(
    titleScreen(ui, input, {
      play: () => (accountsEnabled && !playingAsGuest && accountState().kind === 'guest' ? showPlayGate() : showMenu()),
      challenge: () => showChallenge(),
      incubator: () => showIncubator(() => showTitle({ focus: 'eggs' })),
      gifts: showGifts,
      missions: () => showMissions(),
      ready: () => (pressedStart = true),
      // The language may change inside Settings, so closing them rebuilds the title on the same entry.
      settings: (focus) => openSettings(ui, input, () => showTitle({ focus })),
      news: (focus) => newsScreen(ui, input, () => showTitle({ focus })),
      // Closed unanswered, the lobby highlights the survey's clipboard; answered, it's gone and JOGAR is.
      survey: () => surveyScreen(ui, input, () => showTitle({ focus: 'survey' })),
      halloween: (focus) =>
        halloweenScreen(ui, input, {
          gifts: showGifts,
          support: () => setScreen(supportersScreen(ui, input, { play: (id) => void startRun(id), onClose: () => showTitle({ focus }) }, null)),
          close: () => showTitle({ focus }),
        }),
      discord: (focus) => discordScreen(ui, input, () => showTitle({ focus })),
      pokedex: (focus) => pokedexScreen(ui, input, () => showTitle({ focus }), showPcBox),
      // Over the Kecleon plaza; closing it leaves `?loja` behind too.
      mart: openShop,
      // Closing rebuilds the title, so a sign in's merged save shows up on the Trainer chip.
      trainer: (focus) =>
        trainerCardScreen(ui, input, { supporters: (back) => supportersScreen(ui, input, { play: (id) => void startRun(id), onClose: back }, null) }, () => showTitle({ focus })),
      ranking: rankingEnabled ? (focus) => rankingScreen(ui, input, () => showTitle({ focus }), { difficulty: loadSave().difficulty, mode: runMode(loadSave().partner) }) : undefined,
      ideas: rankingEnabled ? (focus) => suggestionsScreen(ui, input, () => showTitle({ focus })) : undefined,
      supporters: (focus, open) => supportersScreen(ui, input, { play: (id) => void startRun(id), onClose: () => showTitle({ focus }) }, open),
      invites: (focus) => invitesScreen(ui, input, () => showTitle({ focus })),
      meadow,
    }, opts),
  )
}

/** Set once the player picks "play as a guest": the gate doesn't ask again until the page reloads. */
let playingAsGuest = false

/** Sign in or play as a guest, asked when a guest taps Play. */
const showPlayGate = () =>
  setScreen(
    playGate(ui, input, {
      play: () => showMenu(),
      guest: () => ((playingAsGuest = true), showMenu()),
      back: () => showTitle({ focus: 'play' }),
    }),
  )

/** The partner select; its top bar leads back to the title, to the Poké Mart (the wallet) and to Settings, which come back to it on the same Pokémon. */
const showMenu = (initial: PlayableId = loadSave().partner) => {
  endRun()
  prefetchRun()
  const select = starterSelect(ui, input, {
    pick: (id) => setTimeout(() => void startRun(id), 250),
    back: () => showTitle({ focus: 'play' }),
    mart: () => showShop(),
    settings: () => setScreen(openSettings(ui, input, () => showMenu(select.selected()))),
    incubator: () => showIncubator(() => showMenu(select.selected())),
  }, initial)
  setScreen(select)
}

/** The save's companion for a run starting now, if it's a supporter's and still allowed (its sprites start loading). */
const runCompanion = (at: Vec): CompanionView | null => {
  const save = loadSave()
  const c = save.companion
  if (!c || !isSupporter(save) || !canWalkWith(save, c)) return null
  const { dex, sparkles } = companionForm(c.id)
  void (c.shiny ? preloadShinies([dex]) : loadSpecies(dex)).catch(() => {})
  return createCompanion(dex, c.shiny, at, sparkles ?? null)
}

/** The shop from the partner select's wallet: straight to the plaza, and back to the select. */
const showShop = () => showTitle({ shop: 'shop', instant: true, back: () => showMenu() })

/** The Caixa do PC (from the Pokédex); its Trainer Card stands the last Pokémon played beside the trainer. */
const showPcBox = (back: () => void) =>
  pcBoxScreen(ui, input, { onClose: back, trainerCard: (close) => sharePreview(ui, input, trainerShare(loadSave().partner), close) }, loadSave().style.equipped.wallpaper)

const showMissions = () => setScreen(missionsScreen(ui, input, () => showTitle({ focus: 'missions' })))

/** The Desafio do dia's screen (from the title); its board opens over it and comes back to it. */
const showChallenge = () => {
  endRun()
  prefetchRun(challengeToday().day)
  setScreen(
    challengeScreen(ui, input, {
      play: (c, official) => setTimeout(() => void startRun(c.starter, { challenge: c, official }), 250),
      board: rankingEnabled ? () => setScreen(rankingScreen(ui, input, () => showChallenge(), { challenge: true })) : undefined,
      onClose: () => showTitle({ focus: 'challenge' }),
    }),
  )
}

/** Today's challenge again (Try again after one): practice now, unless the attempt didn't count (a quit in the first minute). */
const replayChallenge = () => {
  const c = challengeToday()
  return startRun(c.starter, { challenge: c, official: nextIsOfficial(c.day, loadAttempt(), null) })
}

/** The incubator; hatching a ready egg plays its scene and comes back here. */
const showIncubator = (back: () => void) => {
  endRun()
  setScreen(incubator(ui, input, { onHatch: (i) => hatchAt(i, () => showIncubator(back)), onClose: back }))
}

/**
 * Hatches the ready egg at `index`, saving it with its missions and medals,
 * and plays its scene, then `then`. What it completed toasts once the scene is over.
 */
const hatchAt = (index: number, then: () => void) => {
  const result = hatchEgg(loadSave(), index, createRng(Date.now()))
  if (!result) return then()
  const record = saveHatch(result.save, result.hatch.shiny)
  void syncSave()
  showHatch(result.hatch, then, undefined, () => later(() => progressToast(ui, record)))
}

const showHatch = (hatch: Hatch, then: () => void, holdAt?: number, after = () => {}) =>
  setScreen(hatchScene(ui, input, hatch, { play: () => (void startRun(hatch.id), after()), done: () => (then(), after()) }, holdAt))

/** Leaves the run; every egg it made ready hatches first ("Oh? The Egg is hatching!"), then `then`. */
const afterRun = (then: () => void) => {
  endRun()
  const ready = loadSave().eggs.findIndex(isReady)
  if (ready < 0) return then()
  hatchAt(ready, () => afterRun(then))
}

/**
 * The lobby's gift box: opens the waiting Mystery Gifts one by one. A shiny
 * hatch plays its scene (recorded in the missions and medals) and a shiny
 * ticket goes to the Hall's picker, each coming back to the next gift, or
 * to the lobby once none waits.
 */
const showGifts = () => {
  const back = () => (giftInbox().length > 0 ? showGifts() : showTitle({ focus: 'gifts' }))
  setScreen(
    giftScreen(ui, input, {
      hatch: (hatch) => {
        const record = saveHatch(loadSave(), hatch.shiny)
        void syncSave()
        showHatch(hatch, back, undefined, () => later(() => progressToast(ui, record)))
      },
      pick: () => setScreen(supportersScreen(ui, input, { play: (id) => void startRun(id), onClose: back }, 'pick')),
      close: () => showTitle({ focus: 'gifts' }),
    }),
  )
}

/** Moves the run's steps and new eggs into the incubator, once each (a victory banks, then endless banks again). */
const bankHatchery = (r: Run) => {
  const g = r.game
  const steps = toSteps(localPlayer(g).walked)
  const fresh = g.eggs.found.slice(r.hatchery.eggs).map((e) => ({ tier: e.tier, steps: steps - toSteps(e.at) }))
  if (steps === r.hatchery.steps && fresh.length === 0) return
  const { converted } = bankEggs(steps - r.hatchery.steps, fresh)
  r.hatchery = { steps, eggs: g.eggs.found.length }
  r.convertedEggs.full.push(...converted)
}

/**
 * Moves the run's ₽ not banked yet into the wallet and saves its Pokédex log.
 * Quitting keeps coins but forfeits the survival bonus, unless Mewtwo already
 * fell (victory or endless). Every species seen or defeated counts either way.
 */
const bankRun = (r: Run, withBonus: boolean) => {
  const g = r.game
  const total = withBonus ? runEarnings(g).total : g.coins
  if (total > r.paid) depositPokeDollars(total - r.paid)
  r.paid = Math.max(r.paid, total)
  if (g.candies > r.candies) updateSave((save) => addCandies(save, g.candies - r.candies))
  r.candies = Math.max(r.candies, g.candies)
  bankHatchery(r)
  // Merged into the stored Pokédex, which an account sync may have grown during the run.
  updateSave((save) => ({ ...save, dex: mergeDex(save.dex, recordRun(r.dexBase, g.dexLog)) }))
}

/**
 * Records the run into missions and achievements. Safe to call again (victory,
 * then endless mode, then the way out): only what changed since counts.
 */
const recordProgress = (r: Run) => {
  const summary = summarizeRun(r.game)
  // Reward eggs share the run's egg cap with the eggs it found.
  const record = recordRunProgress(summary, r.recorded, Math.max(0, EGGS.perRun - r.game.eggs.found.length - r.rewardEggs))
  r.recorded = summary
  r.unlocked.push(...record.unlocked)
  r.reward += record.reward
  r.rewardEggs += record.eggs.length
  r.convertedEggs.full.push(...record.converted.full)
  r.convertedEggs.cap.push(...record.converted.cap)
  r.rewardItems.push(...record.items)
  return record
}

/**
 * Reports the run to the ranking (signed in): at a victory or a faint, and on
 * the way out, which only sends again if the run went on into endless mode.
 * Quits in the first minute aren't worth a line on the profile.
 */
const rankRun = (r: Run) => {
  const result = runResult(r.game, __GAME_VERSION__)
  if (!rankable(result)) return
  if (r.ranked) r.rank = r.ranked.submit(result, r.recorder.replay)
  // The first challenge run of the day that counts is this device's attempt; it grows if it goes on into endless mode.
  const c = r.challenge
  if (c && (c.attempt || loadAttempt()?.day !== c.day)) {
    c.attempt = true
    saveAttempt({ day: c.day, time: result.time })
  }
}

/** Reports how the run ended, once, with the build it ended on and, for a faint, what landed the last hit. */
const reportRun = (r: Run, faint: Extract<GameEvent, { kind: 'gameover' }> | null = null) => {
  if (r.reported) return
  r.reported = true
  const g = r.game
  const p = localPlayer(g)
  track('run_end', {
    starter: p.starter,
    difficulty: g.difficulty,
    mode: runMode(p.starter),
    outcome: g.endless ? 'endless' : g.phase === 'victory' || g.phase === 'gameover' ? g.phase : 'quit',
    minute: Math.floor(g.time / 60),
    level: p.level,
    kills: g.kills,
    stage: p.stage,
    branch: p.branch,
    ability: p.ability.id,
    mega: p.mega.stone,
    megas: p.mega.count,
    moves: p.moves.map((m) => `${m.id}:${m.level}`),
    items: p.items.map((i) => `${i.id}:${i.level}`),
    bosses: g.tally.bossKills,
    foe: faint?.foe ?? null,
    hit: faint?.hit ?? null,
    coins: r.paid,
    bag: [...r.recorder.replay.start.bag],
    ...challengeKind(r.challenge),
    ...runPerf(),
    ...(g.halloween ? { candies: g.candies } : {}),
  })
}

/** How the device coped with the run: canvas memory at its peak and the frames while playing. */
const runPerf = () => {
  const f = runFrames(frames)
  return {
    peakCanvasMb: mb(canvasStats.peakBytes),
    peakCanvases: canvasStats.peakLive,
    deviceMemory: deviceMemory(),
    frameAvg: f.avg,
    frameP95: f.p95,
    longFrames: f.long,
  }
}

/** The `challenge` field of a run's events: a Desafio do dia run says whether it started as the official attempt. */
const challengeKind = (c: { official: boolean } | null) => (c ? { challenge: c.official ? ('official' as const) : ('practice' as const) } : {})

/** What an error report says about where the player was: in a run, its replay so far, which plays the run again up to the error (`resimulate`). */
const errorContext = (): ErrorContext => {
  const r = run
  if (!r) return { in_run: false }
  const g = r.game
  return { in_run: true, starter: localPlayer(g).starter, phase: g.phase, minute: Math.floor(g.time / 60), tick: r.recorder.tick, replay: JSON.stringify(r.recorder.replay) }
}

const endRun = () => {
  if (!run) return
  if (run.coop) return endCoopRun(run, run.coop)
  bankRun(run, wonRun(run.game))
  reportRun(run)
  rankRun(run)
  // Only a quit run can complete something here: the results screen already showed the rest.
  // The toast waits for the next screen, so it lands on top of it.
  const record = recordProgress(run)
  later(() => progressToast(ui, record))
  void syncSave()
  run.overlay?.dispose()
  run.closeText?.()
  run.hud.dispose()
  clearToasts(ui)
  run = null
  syncRunWatch()
}

const loadingScreen = () => h('div', { class: 'screen' }, h('p', { class: 'loading blink' }, t().loading))

/** The next run's seed, the day's outbreak, whether it's haunted (Noite das Bruxas) and the wild cast (a legend's own, `legend`), drawn ahead so the menus can warm up its first stage. */
type RunPlan = { seed: number; outbreak: EnemyId; halloween: boolean; legend: boolean; roster: Roster }

/** A Desafio do dia run, as `startRun` takes it: the challenge, and whether the screen called it official. */
type ChallengeRun = { challenge: Challenge; official: boolean }

/** A run's plan from `seed`, `outbreak`, `halloween` and `legend`: the API's for a ranked run, else the game's own and the device's day. */
const planRun = (seed = Date.now(), outbreak = outbreakToday(), halloween = halloweenToday(), legend = false): RunPlan => ({
  seed,
  outbreak,
  halloween,
  legend,
  roster: runRoster(seed, outbreak, halloween, legend),
})

let upcoming = planRun()

/**
 * Asks ahead for the next ranked run's ticket (`day`: a Desafio do dia's), so
 * Play never waits on it. Only between runs: a new token replaces the one a
 * run in progress plays. A regular ticket's seed, outbreak and haunting become
 * the next plan, so the menus warm up the cast it draws.
 */
const prefetchRun = (day: DayKey | null = null) =>
  void prefetchRanked(day).then((ticket) => {
    if (!ticket || ticket.seed === null || day) return
    const outbreak = outbreakToday(ticket.outbreak)
    const halloween = halloweenToday(ticket.halloween)
    if (upcoming.seed !== ticket.seed || upcoming.outbreak !== outbreak || upcoming.halloween !== halloween) upcoming = planRun(ticket.seed, outbreak, halloween, upcoming.legend)
  })

/**
 * Species a run may need outside its drawn cast, with when they can first show
 * up: the fleeing Meowth and the escort mission's Togepi. A rift's legendary,
 * a place's dwellers and the reaper load when the run gets near them (`runSprites`).
 */
const EXTRAS = [
  { dex: MEOWTH_DEX, at: MAP_EVENTS.meowth.spawn.from },
  { dex: TOGEPI_DEX, at: FIELD.first },
]

/** Dex numbers of a cast's first stage, the only enemies a run waits for. */
const openingDex = (plan: RunPlan) => rosterSchedule(plan.roster).flatMap((s) => (s.at === 0 ? [s.dex] : []))

/** Milliseconds between sprite syncs (`syncSprites`). */
const SPRITE_SYNC = 3000
/**
 * Syncs a sheet survives undrawn before it's freed: a run lets go of a past
 * stage's horde within seconds; the menus keep what they loaded for a minute,
 * so a screen's art never vanishes while it's open.
 */
const RUN_IDLE = 2
const MENU_IDLE = 20

/**
 * What the menus stream and keep: the Noite das Bruxas' ghosts in the meadow first, the plaza's
 * Kecleon (off screen most of the time, and back after a run swept it), every region's starter trio
 * (the partner select), then the next run's first stage.
 */
const menuSprites = () => [
  ...new Set([
    ...(halloweenToday() ? HAUNT_DEX : []),
    KECLEON_DEX,
    // The plaza's visitors today: Meowth at his caravan, a seasonal stall's keeper.
    ...(scene.plaza.visitors.caravan ? [CARAVAN.dex] : []),
    ...(scene.plaza.visitors.stall ? [STALLS[scene.plaza.visitors.stall].dex] : []),
    ...REGIONS.flatMap((r) => r.starters.map((id) => STARTERS[id].line[0].dex)),
    ...openingDex(upcoming),
  ]),
]

/**
 * Hands the sprite stream what's needed now and next, and frees the sheets
 * nothing needs any more (`sweepSprites`): during a run its current and next
 * stages, what's alive and the player's line, so a phone's memory stays flat
 * over the 15 minutes instead of holding every species and shiny the run met.
 */
const syncSprites = () => {
  if (run) {
    const { stream, keep } = runSprites(run.game, run.sprites.needs, run.sprites.always)
    streamSpecies(stream)
    // The results screen is a menu: its share card loads the run's shinies and legendaries to draw them.
    const over = run.game.phase === 'gameover' || run.game.phase === 'victory'
    sweepSprites(keep, over ? MENU_IDLE : RUN_IDLE)
    return
  }
  const menu = menuSprites()
  streamSpecies(menu)
  sweepSprites({ species: new Set(menu), variants: new Set() }, MENU_IDLE)
}

/**
 * Loads the starter's evolution line and the first stage's species, then starts
 * a fresh run: a regular one from the save (upgrades, the Bag's armed items),
 * or the Desafio do dia's (`challengeStart`: its seed, nothing from the save
 * but the shiny colors). The rest of the cast (later stages, swarms, bosses) and the
 * `EXTRAS` stream in the background as the run nears them (`syncSprites`).
 */
const startRun = async (starter: PlayableId, daily: ChallengeRun | null = null) => {
  // Play again on a build that fell behind (`watchDeploys`): the newer one first, back in the lobby.
  if (reloadForDeploy) return location.reload()
  setScreen(null)
  endRun()
  wonLastRun = false
  const c = daily?.challenge ?? null
  // The Desafio do dia's Pokémon is the day's, not the player's pick.
  if (!c) updateSave((s) => ({ ...s, partner: starter }))
  const loading = loadingScreen()
  ui.append(loading)
  // The ticket asked for ahead: its clock restarts now, while the sprites load. Without one the run is unranked.
  const ranked = startRanked(c?.day ?? null)
  // A ranked run plays the seed the API dealt (a challenge's is the day's); the replay starts from it and the cast is drawn from it.
  const seed = c ? c.seed : (ranked?.seed ?? upcoming.seed)
  // And the outbreak and haunting it dealt with the ticket (the API checks them by its own clock); without one, the device's day.
  const outbreak = outbreakToday(ranked?.outbreak ?? null)
  const halloween = halloweenToday(ranked?.halloween ?? null)
  const legend = !c && isLegend(starter)
  // A plan from another day (the menus stayed open past midnight) would play yesterday's outbreak (or haunting).
  const plan = c
    ? planRun(seed, c.outbreak, c.halloween)
    : upcoming.seed === seed && upcoming.outbreak === outbreak && upcoming.halloween === halloween && upcoming.legend === legend
      ? upcoming
      : planRun(seed, outbreak, halloween, legend)
  // The next run likely plays the same mode: its plan draws that horde.
  if (!c) upcoming = planRun(undefined, undefined, undefined, legend)
  // The whole family, branches included: the evolution scene can land on any of them.
  await loadAll([...familyDex(starter), ...openingDex(plan)])
  // The outbreak's shiny can show up in the first minute.
  void preloadShinies([ENEMIES[plan.outbreak].dex])
  // Armed bag items are used up as the run starts, as many as the shop's level lets a run take (the challenge leaves them in the Bag).
  // Honey stays in the Bag for a run without an outbreak (a legend's).
  const before = loadSave()
  // So does an Everstone for a Pokémon that never evolves anyway (a legend, a single-stage family).
  const evolves = !legend && PLAYABLE[starter].line.length > 1
  const keep = (id: BagItem) => (id === 'honey' && legend) || (id === 'everstone' && !evolves)
  const { bag, used } = c ? { bag: before.bag, used: [] } : useArmed(before.bag, SHOP_LEVELS[before.shop.level].bagSlots, keep)
  updateSave((s) => ({ ...s, bag }))
  const save = loadSave()
  const start: ReplayStart = c ? challengeStart(c, view, challengeShiny(c)) : {
    seed: plan.seed,
    starter,
    difficulty: save.difficulty,
    ranks: save.ranks,
    // An owned shiny (rolled once, a ticket or a shiny hatch) plays shiny unless switched to Normal.
    shiny: playsShiny(save, starter),
    luckyEgg: save.eggs.length === 0 && HATCHLING_IDS.every((id) => !save.hatched[id]),
    outbreak: plan.outbreak,
    halloween: plan.halloween,
    bag: used,
    // The shop's armed TMs, evolution items and this Pokémon's Bottle Caps (the challenge brings none).
    tms: armedTms(save.tms, tmLimit(save.shop.level)),
    evo: [...save.evo],
    caps: capLevel(save.caps, starter),
    view: { w: view.w, h: view.h },
  }
  // Created like a replay is re-simulated (the roster drawn ahead is the same one).
  const game = startGame(start, view)
  const me = localPlayer(game)
  // The 1/64 roll unlocks this Pokémon's shiny for good (Normal/Shiny on the select screen).
  if (me.luckyShiny) updateSave((s) => ({ ...s, shinyStarters: unlockShinyStarter(s.shinyStarters, starter) }))
  // A shiny run must not start in normal colors.
  if (me.shiny) await preloadShinies(familyDex(starter))
  // Alternate forms (Aegislash's Blade Forme) stream in behind; until then the normal form stands in.
  void preloadForms(familyDex(starter), me.shiny)
  loading.remove()
  run = {
    game,
    hud: runHud(game),
    overlay: null,
    shown: null,
    closeText: null,
    paid: 0,
    candies: 0,
    reported: false,
    missionsBefore: missionStatus(save.missions, today()),
    recorded: null,
    unlocked: [],
    reward: 0,
    rewardEggs: 0,
    rewardItems: [],
    hatchery: { steps: 0, eggs: 0 },
    convertedEggs: { full: [], cap: [] },
    dexBase: save.dex,
    recorder: startRecording(start),
    ranked: ranked?.ranked ?? null,
    rank: null,
    bestBefore: save.achievements.lifetime.bestTime,
    challenge: daily ? { day: daily.challenge.day, official: daily.official, attempt: false } : null,
    companion: runCompanion(me),
    // The run's own roster: a legend's (`avoidLegend`) may have swapped a boss.
    sprites: { needs: castNeeds(game.roster, EXTRAS), always: [...familyDex(starter), playerDex(game), ENEMIES[plan.outbreak].dex] },
    coop: null,
  }
  if (run.companion) run.sprites.always.push(run.companion.dex)
  // The menus' sheets age out from here; the run's next stage starts streaming.
  syncSprites()
  // The crash watch holds the run from now on (`bugReport.ts`), and the run's own peaks and frames start here.
  resetCanvasPeaks()
  resetRunFrames(frames)
  syncRunWatch()
  track('run_start', { starter, difficulty: game.difficulty, mode: runMode(starter), ...challengeKind(run.challenge) })
  announceRun(start, run.challenge)
}

/** The run's first toasts: the challenge it plays, the day's outbreak, then each bag item it used and each TM it armed. */
const announceRun = (start: ReplayStart, challenge: Run['challenge']) => {
  if (challenge) {
    const m = t().challenge
    toast(ui, h('span', { class: 'item-toast' }, h('img', { src: ribbonIcon('gold'), alt: '' }), h('span', {}, rich(m.started(formatDay(challenge.day))), h('small', {}, challenge.official ? m.startedOfficial : m.startedPractice))), 4200, 'challenge')
  }
  if (start.halloween) {
    const m = t().halloween
    toast(ui, h('span', { class: 'item-toast halloween-toast' }, h('img', { src: jackIcon(), alt: '' }), h('span', {}, rich(m.started), h('small', {}, m.startedHint))), 4600, 'halloween')
  }
  // A legend's horde has no outbreak (`runRoster`).
  if (start.outbreak && !isLegend(start.starter)) {
    const def = ENEMIES[start.outbreak]
    toast(ui, h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), h('span', {}, rich(t().outbreak.started(def.name)), h('small', {}, t().outbreak.hint))), 4200, 'outbreak')
  }
  for (const id of start.bag) toast(ui, h('span', { class: 'item-toast' }, shopIcon(id), h('b', {}, BAG_ITEMS[id].name), t().bag.active[id]), 3200, id)
  // Each armed TM says which of the run's TM drops it is: the first, then the second.
  for (const [i, id] of (start.tms ?? []).entries()) toast(ui, h('span', { class: 'item-toast' }, tmPicture(id), rich(t().toast.armedTm(MOVES[id].name, i))), 3200, `tm-${id}`)
}

const runHud = (game: Game, onPause: () => void = () => game.phase === 'playing' && (game.phase = 'paused')) => {
  const hud = createHud(ui, queueSpecial, queueMega, queueLunge, onPause, input.isHeld)
  requestAnimationFrame(syncMarkerInsets)
  return hud
}

/** Measures the HUD (top bar, status box, special button) in world px, so map event arrows stay clear of it. */
const syncMarkerInsets = () => {
  const box = canvas.getBoundingClientRect()
  // Hidden elements (the touch special button on desktop) measure 0x0: they don't count.
  const rect = (sel: string) => {
    const r = ui.querySelector(sel)?.getBoundingClientRect()
    return r && r.height > 0 ? r : null
  }
  const bottomOf = (sel: string) => rect(sel)?.bottom ?? box.top
  const topOf = (sel: string) => rect(sel)?.top ?? box.bottom
  const top = bottomOf('.hud-row') - box.top
  const bottom = box.bottom - Math.min(topOf('.hud .status'), topOf('.special-button'))
  setMarkerInsets({ top: Math.max(0, top) / cssScale + 10, bottom: Math.max(0, bottom) / cssScale + 10, side: 14 })
}

/** Settings from the pause menu. The HUD reads its labels once, so a language switch rebuilds it. */
const runSettings = (r: Run, back: () => void) => {
  const before = locale()
  return openSettings(ui, input, () => {
    if (locale() !== before) {
      r.hud.dispose()
      r.hud = runHud(r.game)
    }
    // The joystick mode moves the status box and shows or hides the fixed stick.
    dirty = true
    requestAnimationFrame(syncMarkerInsets)
    back()
  })
}

/** Rebuilds the modal overlay whenever the simulation phase (or this player's offer set) changes. */
const syncOverlay = (r: Run) => {
  const c = r.coop
  // Co-op shows its copy of the game: this player as "the player" (`coop/view.ts`).
  const g = c ? c.view.game : r.game
  const me = localPlayer(g)
  if (c && c.sent !== null && c.sent !== me.round) c.sent = null
  // This player's own pick screen while the world waits on picks; the world's phase otherwise.
  // Co-op: a pick sent closes its screen while it travels; the pause menu is the client's own.
  const phase: Phase = c?.menu && !coopOver(g) && g.phase !== 'victory' ? 'paused' : c && c.sent !== null && onScreen(me) ? 'playing' : phaseOf(g, me)
  if (r.shown?.phase === phase && r.shown.offers === me.offers) return
  r.overlay?.dispose()
  r.overlay = null
  r.shown = { phase, offers: me.offers }
  r.hud.setMenuOpen(phase !== 'playing' && phase !== 'evolving')
  // A pick: solo it plays on the spot (and goes into the replay); co-op sends it with the screen's round, read now.
  const pick = (offer: Offer) => {
    if (!c) return (recordEvent(r.recorder, ['offer', me.offers.indexOf(offer)]), chooseOffer(g, offer))
    const index = me.offers.indexOf(offer)
    if (index < 0 || !onScreen(me)) return
    c.client.input({ k: 'pick', screen: me.phase as PickScreen, round: me.round, index })
    c.sent = me.round
  }
  const screenInput = (k: 'reroll' | 'skip') => {
    if (!c) return k === 'reroll' ? (recordEvent(r.recorder, ['reroll']), rerollOffers(g)) : (recordEvent(r.recorder, ['skip']), skipLevelUp(g))
    c.client.input({ k, round: me.round })
    c.sent = me.round
  }
  switch (phase) {
    case 'levelup':
      r.overlay = levelUp(ui, input, g, pick, {
        reroll: () => screenInput('reroll'),
        skip: () => screenInput('skip'),
        banish: (i) => {
          if (!c) return (recordEvent(r.recorder, ['banish', i]), banishOffer(g, i))
          c.client.input({ k: 'banish', round: me.round, index: i })
          c.sent = me.round
        },
      })
      break
    case 'branch':
      r.overlay = branchPick(ui, input, g, pick)
      break
    case 'ability':
      r.overlay = abilityPick(ui, input, g, pick)
      break
    case 'tm':
      // A TM raising an owned move to a fork shows the fork's two branches, as a level-up would.
      r.overlay = me.offers.some((o) => o.kind === 'branch') ? levelUp(ui, input, g, pick) : tmPick(ui, input, g, pick)
      break
    case 'curse':
      r.overlay = cursePick(ui, input, g, pick)
      break
    case 'pokeball':
      r.overlay = pokeballPick(ui, input, g, pick)
      break
    case 'paused':
      if (c) {
        r.overlay = pauseMenu(ui, input, g, {
          resume: () => (c.menu = false),
          quit: () => leaveCoopRun(),
          settings: (back) => runSettings(r, back),
          report: bugReportsEnabled ? (back) => bugReportForm(ui, input, back) : null,
        })
        break
      }
      r.overlay = pauseMenu(ui, input, g, {
        // Only from the pause: a late press must never flip a level-up to playing (unrecorded) or end the run under it.
        resume: () => g.phase === 'paused' && (g.phase = 'playing'),
        quit: () => g.phase === 'paused' && afterRun(() => showMenu()),
        settings: (back) => runSettings(r, back),
        report: bugReportsEnabled ? (back) => bugReportForm(ui, input, back) : null,
      })
      break
    case 'gameover':
    case 'victory':
      if (c) {
        const share = Math.floor(r.game.coins / Math.max(1, r.game.coop?.joined ?? 1))
        const voting = g.phase === 'victory' && g.coop?.vote?.outcome === 'open' && !c.voted
        r.overlay = coopEnd(ui, input, g, me.slot, share, {
          vote: voting ? (endless) => ((c.voted = true), c.client.input({ k: 'endless', vote: endless })) : null,
          back: () => leaveCoopRun(),
        })
        break
      }
      // For Play again: the run is over (endless mode goes on with the token it reported on).
      prefetchRun(r.challenge ? challengeToday().day : null)
      r.overlay = results(
        ui,
        input,
        g,
        () => afterRun(() => void (r.challenge ? replayChallenge() : startRun(loadSave().partner))),
        () => afterRun(() => showMenu()),
        () => (recordEvent(r.recorder, ['endless']), continueEndless(g)),
        {
          badge: titleBadge(loadSave().title),
          report: missionReport(r.missionsBefore, r.reward, r.rewardEggs, r.rewardItems),
          medals: medalChips(r.unlocked),
          eggs: { converted: r.convertedEggs, ready: loadSave().eggs.filter(isReady).length },
          news: dexNews(r.dexBase, g.dexLog),
          ranking: rankingEnabled
            ? { panel: rankPanel(r.rank, r.challenge !== null, runMode(me.starter)), open: (back) => rankingScreen(ui, input, back, { difficulty: g.difficulty, mode: runMode(me.starter), challenge: r.challenge !== null }) }
            : null,
          share: {
            open: (back) => sharePreview(ui, input, runShare(g, r.dexBase, r.challenge && r.rank ? r.rank.then((o) => (o.kind === 'ranked' ? o.challenge : null)) : null), back),
            glow: me.shiny || g.dexLog.shinies.size > 0 || wonRun(g) || g.time > r.bestBefore,
          },
          credits: g.phase === 'victory' && rankingEnabled ? creditsLine() : null,
        },
      )
      break
  }
}

/** Level-ups that took the Oran Berry on their own (`takeBerryLevelUps`): the level reached and how many at once. */
const berryToast = (g: Game, count: number) =>
  toast(ui, h('span', { class: 'item-toast' }, h('img', { src: berryIcon(), alt: '' }), rich(t().levelUp.autoBerry(localPlayer(g).level, count))), 2200, 'autoBerry')

/** An evolution item's toast: its icon, a line and a hint under it. */
const evoItemToast = (items: readonly EvoItemId[], line: string, hint: string, key: string) =>
  toast(ui, h('span', { class: 'item-toast evo-item-toast' }, ...items.map((id) => shopIcon(id, EVO_ITEMS[id].name)), h('span', {}, rich(line), h('small', {}, hint))), 4200, key)

/** After a branching evolution: the paths it left closed for lack of an item, with their items' icons (none: no toast). */
const closedPathsToast = (g: Game) => {
  const me = localPlayer(g)
  const branch = me.branch
  if (!branch || !branchesAt(me.starter, me.stage).includes(branch)) return
  const held = runEvoItems(g)
  const missing = branchesAt(me.starter, me.stage).flatMap((b) => {
    const item = branchNeeds(b)
    return b !== branch && item && !held.includes(item) ? [item] : []
  })
  if (missing.length === 0) return
  const items = EVO_ITEM_IDS.filter((id) => missing.includes(id))
  toast(ui, h('span', { class: 'item-toast evo-item-toast' }, ...items.map((id) => shopIcon(id, EVO_ITEMS[id].name)), h('span', {}, t().branch.others)), 4200, 'evoClosed')
}

/** After an evolution: what the new form can learn now (`unlockedAt`), each move with its icon. */
const learnsToast = (g: Game) => {
  const me = localPlayer(g)
  const moves = unlockedAt(me.starter, me.branch, me.stage)
  if (moves.length === 0) return
  const chips = moves.map((id) => h('span', { class: 'learn-move', style: `--type:${TYPE_COLORS[MOVES[id].type]}` }, h('img', { src: moveIcon(id), alt: '' }), MOVES[id].name))
  toast(ui, h('span', { class: 'learn-toast' }, h('span', {}, t().toast.learns(playerForm(g).name)), h('span', { class: 'learn-moves' }, ...chips)), 5000, 'learns')
}

/** The ability's word: the pick, and the moments worth a toast (Sturdy holding, a weather called, a milestone, Moody's draw). */
const abilityFeedback = (g: Game, id: AbilityId, moment: 'picked' | 'proc') => {
  const m = t().ability
  const name = ABILITIES[id].name
  const icon = (text: string) => h('span', { class: 'item-toast ability-toast' }, h('img', { src: abilityIcon(id), alt: '' }), rich(text))
  if (moment === 'picked') {
    playSfx('unlock')
    return toast(ui, icon(m.picked(playerForm(g).name, name)), 3200, 'ability')
  }
  const effects: readonly AbilityEffect[] = ABILITIES[id].effects
  const kind = effects.find((e) => e.kind !== 'immune' && e.kind !== 'stats')?.kind
  if (kind === 'sturdy') {
    playSfx('stance', 0)
    flashScreen(ui)
    return toast(ui, icon(m.sturdy(name)), 2600, 'ability')
  }
  if (kind === 'guard') return playSfx('stance', 0)
  if (kind === 'summon') return toast(ui, icon(m.summon(name)), 2200, 'ability')
  if (kind === 'onKill') {
    playSfx('shiny')
    return toast(ui, icon(m.stack(name, abilityStacks(g))), 2200, 'ability')
  }
  if (kind === 'moody') {
    const mood = m.moods[localPlayer(g).ability.mood]
    return mood && toast(ui, icon(m.mood(name, mood)), 1800, 'ability')
  }
  if (kind === 'timer') playSfx('item')
}

/** The move or item a Poké Ball held, by its official name. */
const offerName = (offer: Offer) => (offer.kind === 'move' ? MOVES[offer.id].name : offer.kind === 'item' ? ITEMS[offer.id].name : '')

const offerLabel = (offer: Extract<GameEvent, { kind: 'pokeball' }>['offer']) => {
  const m = t().toast
  if (!offer) return m.pokeballEmpty
  if (offer.kind === 'move') return m.pokeballLevel(MOVES[offer.id].name, offer.level)
  if (offer.kind === 'item') return m.pokeballLevel(ITEMS[offer.id].name, offer.level)
  if (offer.kind === 'evolution') return m.pokeballEvolution(MOVES[offer.to].name)
  return m.pokeballBerry
}

/** An Alpha's moments: a roar and a toast when it comes, cues for its charge and rage, a toast when it falls. */
const alphaEvent = (e: Extract<GameEvent, { kind: 'alpha' }>) => {
  const def = ENEMIES[e.enemy]
  switch (e.moment) {
    case 'spawn':
      playSfx('boss')
      playCry(sprites(def.dex).cry, 0.8)
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), rich(t().alphas.appeared(def.name))), 3600)
    case 'aim':
      return playSfx('growl', 200)
    case 'charge':
      return playSfx('charge', 150)
    case 'shock':
      return playSfx('quake', 150)
    case 'enrage':
      playSfx('boss')
      playCry(sprites(def.dex).cry, 0.8)
      return flashScreen(ui)
    case 'down':
      playSfx('evolve')
      return toast(ui, rich(t().alphas.defeated(def.name)), 3200)
  }
}

/** Sounds of enemy traits: the warning (fuse lit, beam aimed, leap) and the moment it goes off. */
const TRAIT_SFX: Record<TraitId, Record<'warn' | 'fire', Sfx | null>> = {
  healer: { warn: null, fire: 'enemyPulse' },
  shield: { warn: null, fire: 'enemyPulse' },
  summoner: { warn: null, fire: 'enemyPulse' },
  kamikaze: { warn: 'selfDestruct', fire: 'blast' },
  beam: { warn: 'beamCharge', fire: 'beam' },
  leaper: { warn: 'leap', fire: 'quake' },
  spitter: { warn: null, fire: 'spit' },
}

const handleEvent = (r: Run, e: GameEvent) => {
  const g = r.game
  switch (e.kind) {
    case 'hit': return playSfx(e.effective > 1 ? 'superHit' : 'hit', 45)
    case 'kill': return playSfx('kill', 50)
    case 'pickup': return playSfx('pickup', 35)
    case 'coin': return playSfx('coin', 60)
    case 'heal': return playSfx('heal')
    case 'hurt': return playSfx('hurt', 120)
    case 'shatter': return playSfx('break', 60)
    case 'guard': return playSfx('stance', 0)
    case 'stolen':
      playSfx('buy')
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: moveIcon('thief'), alt: '' }), rich(t().toast.stolen)), 2600, 'stolen')
    case 'cast': {
      const sound = castSound(e.move) ?? CAST_SFX[e.move]
      return sound && playSfx(sound[0], sound[1])
    }
    case 'levelup': return playSfx('levelUp')
    case 'thunder': return playSfx('thunder', 150)
    case 'quake': return playSfx('quake', 150)
    case 'moveSound': return playSfx(e.sound, 90)
    case 'special': {
      // A chain dash "releases" on every landing: a cut, not an explosion.
      if (e.phase === 'release') return playSfx(gameSpecial(g).def.kind === 'chain' ? 'slash' : 'specialBlast', 0)
      playSfx('specialCharge', 0)
      playCry(playerCry(g), 0.5)
      return toast(ui, rich(t().toast.used(playerName(g), e.name)), 1600, 'special')
    }
    case 'megaChoice': {
      const [a, b] = megasOf(localPlayer(g).starter).map((id) => MEGAS[id].stone)
      playSfx('unlock')
      return a && b && toast(ui, rich(t().mega.choose(a, b)), 4200, 'mega')
    }
    case 'megaStone': {
      const def = heldMega(g)
      if (!def) return
      const me = localPlayer(g)
      const line = PLAYABLE[me.starter].line
      const final = me.stage >= line.length - 1
      playSfx('unlock')
      return toast(
        ui,
        h('span', { class: 'item-toast mega-toast' }, h('img', { src: megaStoneIcon(def), alt: '' }), h('span', {}, rich(t().mega.stone(def.stone)), h('small', {}, rich(final ? t().mega.stoneReady : t().mega.stoneLocked(megaBaseName(g)))))),
        4200,
        'mega',
      )
    }
    case 'megaStart': {
      const def = heldMega(g)
      playSfx('megaCharge', 0)
      playCry(sprites(playerDex(g)).cry, 0.6)
      return def && toast(ui, rich(t().mega.reacting(def.stone)), 1400, 'mega')
    }
    case 'mega': {
      playSfx('megaBurst', 0)
      playCry(playerCry(g), 0.9)
      return banner(ui, rich(t().mega.evolved(playerForm(g).name, e.name)), 2400)
    }
    case 'megaEnd':
      playSfx('stance', 0)
      return toast(ui, t().mega.ended(playerName(g)), 1800, 'mega')
    case 'megaReady':
      playSfx('shiny')
      return toast(ui, rich(t().mega.ready), 2400, 'mega')
    case 'stance': {
      playSfx('stance', 0)
      const who = playerForm(g).name
      return toast(ui, rich(t().toast.stance(who, t().hud.stances[e.stance])), 1200, 'special')
    }
    case 'boss': {
      const def: EnemyDef = ENEMIES[e.enemy]
      // A wave legendary's cry and title card come with its entrance (`legendTitle`).
      if (isWaveLegend(e.enemy)) return
      if (def.legendary) {
        playSfx('legendary')
        playCry(sprites(def.dex).cry, 0.7)
        flashScreen(ui)
        // A legend meets its dark Clone (`isClone`), never itself.
        return banner(ui, rich(t().toast.legendary(localPlayer(g).legend?.id === e.enemy ? t().legend.clone(def.name) : def.name)))
      }
      playSfx('boss')
      playCry(sprites(def.dex).cry, 0.5)
      // A night boss comes in the event's colors.
      if (isNightBoss(e.enemy)) return toast(ui, h('span', { class: 'item-toast halloween-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), rich(t().halloween.nightBoss(def.name))), 3200)
      return toast(ui, rich(t().toast.boss(def.name)), 3200)
    }
    case 'nightBoss': {
      // Its first defeat ticks the Caça aos Fantasmas off (from the run's results, `recordHunt`): the toast says so now.
      const before = loadSave().halloween
      if (before.hunted.includes(e.enemy)) return
      const ticked = recordHunt(before, g.tally.nightBosses).hunted.length
      return toast(ui, h('span', { class: 'item-toast halloween-toast' }, h('img', { src: treatIcon(), alt: '' }), rich(t().halloween.hunted(ENEMIES[e.enemy].name, HALLOWEEN.hunt.candies, ticked, NIGHT_BOSSES.length))), 3600, 'nightBoss')
    }
    case 'disguise': {
      const def = ENEMIES[e.enemy]
      playSfx('break')
      playCry(sprites(def.dex).cry, 0.6)
      return toast(ui, rich(t().halloween.disguise(def.name)), 2400)
    }
    case 'bossFled': {
      const def = ENEMIES[e.enemy]
      playCry(sprites(def.dex).cry, 0.3)
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), rich(t().toast.bossFled(def.name))), 3200)
    }
    case 'enrage': {
      // No toast: the cry, the flash and the boss's red outline carry it.
      playSfx('boss')
      playCry(sprites(ENEMIES[e.enemy].dex).cry, 0.8)
      return flashScreen(ui)
    }
    case 'shiny': {
      const def = ENEMIES[e.enemy]
      playSfx('shiny')
      playCry(sprites(def.dex).cry, 0.4)
      return toast(ui, rich(t().toast.shiny(def.name)), 3200)
    }
    case 'caught': {
      const def = ENEMIES[e.enemy]
      if (dexStatus(r.dexBase, def.dex).shiny) return
      playSfx('shiny')
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex, true), alt: '' }), rich(t().toast.caught(def.name))), 3600)
    }
    case 'shinyPlayer': {
      playSfx('shiny')
      return toast(ui, rich(t().toast.shinyPlayer(PLAYABLE[localPlayer(g).starter].name)), 3600)
    }
    case 'branchChoice':
      playCry(playerCry(g), 0.6)
      return
    case 'evoItem':
      playSfx('unlock')
      return evoItemToast([e.item], t().branch.found(EVO_ITEMS[e.item].name), t().branch.foundHint, 'evoItem')
    case 'evoHeld':
      playCry(playerCry(g), 0.6)
      return evoItemToast(e.items, t().branch.held(playerForm(g).name, e.items.map((id) => `*${EVO_ITEMS[id].name}*`).join(t().branch.or)), t().branch.heldHint, 'evoHeld')
    case 'ability':
      return abilityFeedback(g, e.id, e.moment)
    case 'awaken': {
      playCry(playerCry(g))
      r.closeText?.()
      r.closeText = textBox(ui, t().legend.awakening(playerForm(g).name))
      return
    }
    case 'awakened': {
      playSfx('evolve')
      playCry(cryUrl(playerDex(g), e.form ?? undefined))
      r.closeText?.()
      r.closeText = null
      const name = PLAYABLE[localPlayer(g).starter].name
      return toast(ui, rich(e.form ? t().legend.awakenedForm(name, playerForm(g).name) : t().legend.awakened(name)), 3500)
    }
    // Banked toward capturing it right away (`ui/capture.ts`), so the capture scene reads it.
    case 'legendBeaten':
      return bankCapture(e.legend, e.shiny, g.endless !== null)
    case 'evolve': {
      playCry(sprites(e.from).cry)
      r.closeText?.()
      r.closeText = textBox(ui, t().toast.evolving(playerForm(g).name))
      return
    }
    case 'evolved': {
      playSfx('evolve')
      playCry(sprites(e.to).cry)
      r.closeText?.()
      r.closeText = null
      // The Trainer Card wears the branch this family took last.
      const me = localPlayer(g)
      const branch = me.branch
      if (branch) updateSave((s) => ({ ...s, branches: { ...s.branches, [me.starter]: branch } }))
      toast(ui, t().toast.evolved(formAt(me.starter, me.branch, me.stage - 1).name, playerForm(g).name), 3500)
      learnsToast(g)
      return closedPathsToast(g)
    }
    case 'moveEvolved':
      playSfx('evolve')
      playCry(playerCry(g), 0.3)
      return toast(ui, rich(t().toast.moveEvolved(MOVES[e.from].name, MOVES[e.to].name), { class: 'toast-evo' }), 3500)
    case 'duoFused':
      playSfx('duoFuse')
      playCry(playerCry(g), 0.3)
      return toast(
        ui,
        h('span', { class: 'item-toast toast-duo' }, h('img', { src: moveIcon(e.to), alt: '' }), rich(t().duo.fused(MOVES[e.from[0]].name, MOVES[e.from[1]].name, MOVES[e.to].name))),
        3800,
      )
    case 'curse': {
      // The chest's choice has its own screen; Life Orb and Flame Orb bite quietly (the purple number says it).
      if (e.moment === 'found' || e.moment === 'recoil') return
      const line = e.moment === 'taken' ? t().curse.taken(CURSES[e.id].name) : t().curse.left(CURSES[e.id].name)
      return toast(ui, h('span', { class: 'item-toast toast-curse' }, h('img', { src: curseIcon(e.id), alt: '' }), rich(line)), 3000)
    }
    case 'pokeball':
      // A new move or item opens its own screen; taking it already sounded there.
      if (e.moment === 'found') return playSfx('pokeballOpen')
      if (e.moment === 'left') return e.offer && toast(ui, rich(t().pokeballPick.left(offerName(e.offer))), 2200)
      if (e.moment === 'auto') {
        playSfx('pokeballOpen')
        playSfx('levelUp')
      }
      return toast(ui, t().toast.pokeball(offerLabel(e.offer)))
    case 'shinyOffer':
      // The fresh cards on screen say the rest.
      return playSfx('shiny')
    case 'tm':
      return
    case 'tmLearned': {
      const m = t().tm
      const name = MOVES[e.move].name
      playSfx('levelUp')
      playCry(playerCry(g), 0.35)
      const text = e.forgot ? m.learnedInstead(MOVES[e.forgot].name, name) : e.level > 1 ? m.raised(name, e.level) : m.learned(name)
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: moveIcon(e.move), alt: '' }), rich(text)), 3200, 'tm')
    }
    case 'tmMastered':
      playSfx('coin')
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: moveIcon(e.move), alt: '' }), rich(t().tm.mastered(MOVES[e.move].name, formatPokeDollars(e.coins)))), 3000)
    case 'banish':
      // The level-up screen plays the toss itself.
      return
    case 'consumable': {
      const def = CONSUMABLES[e.item]
      playSfx(def.sfx)
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: consumableIcon(e.item), alt: '' }), h('b', {}, def.name), t().consumables[e.item]), 2200, e.item)
    }
    case 'propBreak':
      return playSfx('break', 60)
    case 'treat':
      return playSfx('treat', 50)
    case 'trickOrTreat': {
      const m = t().halloween
      if (!e.ghost) {
        playSfx('heal')
        return toast(ui, h('span', { class: 'item-toast halloween-toast' }, h('img', { src: treatIcon(), alt: '' }), rich(m.treat)), 2200, 'trickOrTreat')
      }
      playSfx('trick')
      playCry(cryUrl(ENEMIES[e.ghost].dex), 0.5)
      return toast(ui, h('span', { class: 'item-toast halloween-toast' }, h('img', { src: portraitUrl(ENEMIES[e.ghost].dex), alt: '' }), rich(m.trick(ENEMIES[e.ghost].name))), 2600, 'trickOrTreat')
    }
    case 'mapEvent':
      return mapEventFeedback(ui, e.notice)
    case 'place':
      return placeFeedback(ui, e.place, e.notice)
    case 'landmark':
      return landmarkFeedback(ui, e.landmark, e.moment)
    case 'revive':
      playSfx('evolve')
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: consumableIcon('revive'), alt: '' }), rich(t().toast.revive)), 3000)
    case 'maxRevive':
      playSfx('evolve')
      return toast(ui, h('span', { class: 'item-toast' }, shopIcon('maxRevive'), rich(t().toast.maxRevive)), 3400)
    case 'gameover':
      bankRun(r, true)
      recordProgress(r)
      reportRun(r, e)
      rankRun(r)
      playSfx('gameOver')
      return playCry(playerCry(g))
    case 'victory':
      bankRun(r, true)
      recordProgress(r)
      rankRun(r)
      wonLastRun = true
      return playSfx('evolve')
    case 'biome': {
      const w = t().world
      playSfx('item')
      return banner(
        ui,
        h('span', { class: 'biome-banner' }, h('small', {}, w.area(BIOME_ORDER.indexOf(e.biome) + 1, BIOME_ORDER.length)), h('b', {}, w.biomes[e.biome])),
        2800,
      )
    }
    case 'weather':
      return weatherToast(e.weather, e.prev)
    case 'trait': {
      const sfx = TRAIT_SFX[e.trait][e.phase]
      if (sfx) playSfx(sfx, 120)
      return
    }
    case 'traitIntro': {
      const def = ENEMIES[e.enemy]
      playCry(sprites(def.dex).cry, 0.35)
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: portraitUrl(def.dex), alt: '' }), rich(t().traits[e.trait](def.name))), 3400)
    }
    case 'hazardIntro':
      return toast(ui, rich(t().hazards.intro), 3400)
    case 'riftOpen':
      playSfx('shiny')
      return toast(ui, rich(t().rifts.open), 3200)
    case 'riftClosed':
      return toast(ui, t().rifts.closed, 2000)
    case 'riftOmen': {
      const lines = domainLines(e.enemy)
      playSfx('thunder')
      // Rayquaza's Air Lock ends what Kyogre or Groudon stirred up earlier in the run.
      const calmed = e.enemy === 'rayquaza' ? g.rift.met.find((l) => l === 'kyogre' || l === 'groudon') : undefined
      const nod = calmed ? ` ${t().rifts.calms(ENEMIES[calmed].name)}` : ''
      return toast(ui, rich(lines ? `${lines.omen}${nod} ${t().rifts.omen(ENEMIES[e.enemy].name)}` : t().rifts.omenFaint), 4200)
    }
    case 'riftEnter': {
      const def = ENEMIES[e.enemy]
      playSfx('legendary')
      flashScreen(ui)
      const lines = domainLines(e.enemy)
      // A domain's legendary shows itself later, in its own forms: have them ready.
      if (lines) {
        const partner = partnerOf(e.enemy)
        void preloadForms(partner ? [def.dex, ENEMIES[partner].dex] : [def.dex], e.shiny)
        toast(ui, rich(lines.crossing), 3600)
        return banner(ui, rich(t().rifts.enterDomain(lines.place)))
      }
      playCry(sprites(def.dex).cry, 0.7)
      return banner(ui, rich(e.shiny ? t().rifts.enterShiny(def.name) : t().rifts.enter(def.name)))
    }
    case 'riftTitle':
      playSfx('legendary')
      playCry(sprites(ENEMIES[e.enemy].dex).cry, 0.9)
      return flashScreen(ui)
    case 'bossPhase': {
      const def = ENEMIES[e.enemy]
      playSfx('quake')
      playCry(sprites(def.dex).cry, 0.7)
      const line = isRiftLegend(e.enemy) ? domainLines(e.enemy)?.phases[e.phase - 1] : isWaveLegend(e.enemy) ? t().legends.phases[e.enemy][e.phase - 1] : undefined
      return line ? toast(ui, rich(line), 3600) : undefined
    }
    case 'bossUltimate':
      playSfx('legendary')
      return toast(ui, h('span', { class: 'toast-ultimate' }, `${e.move}!`), 2400, 'ultimate')
    case 'riftCapture': {
      // A pair's capture throws a ball at each: the toast follows the one this event is for.
      const both = g.rift.arena?.domain?.capture
      const capture = both?.kind === e.enemy ? both : both?.partner?.kind === e.enemy ? both.partner : null
      const name = ENEMIES[e.enemy].name
      if (showCapture(ui, e.enemy)) return
      if (capture && captureOutcome(capture) === 'caught') {
        playSfx('unlock')
        return toast(ui, rich(t().rifts.caught(name), { class: 'toast-evo' }), 3600)
      }
      playSfx('break')
      playCry(sprites(ENEMIES[e.enemy].dex).cry, 0.6)
      return toast(ui, rich(t().rifts.escaped(name)), 3200)
    }
    case 'domainCue': {
      const line = domainLines(e.enemy)?.cues?.[e.cue]
      return line ? toast(ui, rich(line), 1600) : undefined
    }
    case 'pairDown':
      playSfx('quake')
      playCry(sprites(ENEMIES[e.partner].dex).cry, 0.9)
      return toast(ui, rich(t().rifts.pairDown(ENEMIES[e.enemy].name, ENEMIES[e.partner].name)), 3600)
    case 'pairRevive':
      playSfx('evolve')
      playCry(sprites(ENEMIES[e.partner].dex).cry, 0.8)
      return toast(ui, rich(t().rifts.pairRevive(ENEMIES[e.enemy].name, ENEMIES[e.partner].name)), 3200)
    case 'bossGuard':
      playSfx(e.up ? 'legendary' : 'break')
      return toast(ui, rich(e.up ? t().rifts.guardUp(ENEMIES[e.enemy].name) : t().rifts.guardDown), e.up ? 3400 : 2200)
    case 'legendTitle':
      playSfx('legendary')
      playCry(sprites(ENEMIES[e.enemy].dex, e.shiny).cry, 0.9)
      return flashScreen(ui)
    case 'bossCapture': {
      const capture = g.legendScene?.capture
      const name = ENEMIES[e.enemy].name
      if (showCapture(ui, e.enemy)) return
      if (capture && captureOutcome(capture) === 'caught') {
        playSfx('unlock')
        return toast(ui, rich(t().rifts.caught(name), { class: 'toast-evo' }), 3200)
      }
      playSfx('break')
      playCry(sprites(ENEMIES[e.enemy].dex).cry, 0.6)
      return toast(ui, rich(t().rifts.escaped(name)), 2800)
    }
    case 'riftCleared': {
      playSfx('evolve')
      const partner = partnerOf(e.enemy)
      const text = partner ? t().rifts.pairCleared(ENEMIES[e.enemy].name, ENEMIES[partner].name) : t().rifts.cleared(ENEMIES[e.enemy].name)
      return toast(ui, rich(text, { class: 'toast-evo' }), 3500)
    }
    case 'riftFall':
      playSfx('riftFall')
      playCry(playerCry(g))
      return toast(ui, rich(t().rifts.fall(ENEMIES[e.enemy].name)), 2800)
    case 'riftExit':
      if (e.outcome === 'collapse') {
        playSfx('quake')
        return toast(ui, t().rifts.collapse, 3000)
      }
      if (e.outcome === 'fallen') {
        flashScreen(ui)
        return toast(ui, rich(t().rifts.fallen), 3200)
      }
      return
    case 'reaper':
      playSfx('legendary')
      playCry(sprites(ENEMIES[REAPER].dex).cry, 0.8)
      flashScreen(ui)
      return banner(ui, rich(e.defeats > 0 ? t().rifts.reaperBack : t().rifts.reaper))
    case 'reaperDown':
      playSfx('evolve')
      flashScreen(ui)
      return banner(ui, rich(t().rifts.reaperDown))
    case 'alpha':
      return alphaEvent(e)
    case 'alphaPrize':
      return toast(ui, rich(t().alphas.prize), 2600)
    case 'egg': {
      const m = t().eggs
      // The run's eggs bank when it ends: this one fits if the incubator has a slot for it after the ones found before it.
      const fits = g.eggs.found.length - r.hatchery.eggs <= freeSlots(loadSave().eggs)
      const text = fits ? m.found(m.tiers[e.tier]) : m.foundFull(m.tiers[e.tier], formatPokeDollars(EGG_TIERS[e.tier].refund))
      playSfx('unlock')
      return toast(ui, h('span', { class: 'item-toast' }, h('img', { src: eggIcon(e.tier), alt: '' }), rich(text)), 3600)
    }
  }
}

/** Announces a weather change: what started (and what it does), or what just ended. The newest replaces one still showing. */
const weatherToast = (next: WeatherId, prev: WeatherId) => {
  const w = t().world
  if (next === 'clear') {
    if (prev !== 'clear') toast(ui, h('span', { class: 'item-toast' }, h('img', { src: weatherIcon(prev), alt: '' }), w.weatherEnd[prev]), 2600, 'weather')
    return
  }
  playSfx('select')
  toast(
    ui,
    h('span', { class: 'item-toast weather-toast' }, h('img', { src: weatherIcon(next), alt: '' }), h('span', {}, rich(w.weatherStart[next]), h('small', {}, w.weatherHint[next]))),
    3400,
    'weather',
  )
}

/* ---------------- Music ---------------- */

/** Silence until "press start", then menus play the village theme, a run its biome's theme, and a living boss takes over until it falls. */
const themeFor = (r: Run | null): ThemeId | null => {
  if (!pressedStart) return null
  // The Noite das Bruxas swaps the village for Lavender Tower's tune.
  if (!r || r.game.phase === 'gameover' || r.game.phase === 'victory') return halloweenToday() ? BIOMES.tower.theme : 'menu'
  // A legendary's domain plays its crossing's theme, then its own from the moment it shows itself.
  const domain = r.game.rift.arena?.domain
  if (domain) return domainTheme(domain)
  // A rift arena keeps the boss theme until the player is back, loot window included; a place plays its own.
  const inside = r.game.place.inside
  // A wave legendary plays its own theme from its entrance on.
  const boss = r.game.bossId === null ? undefined : r.game.enemies.find((e) => e.id === r.game.bossId)
  if (boss && isWaveLegend(boss.kind)) return LEGEND_THEME[boss.kind]
  return r.game.bossId !== null || r.game.rift.arena !== null ? 'boss' : inside ? PLACES[inside.id].theme : BIOMES[r.game.biome.id].theme
}

/* ---------------- Global keys ---------------- */

input.onKey((key) => {
  unlockAudio()
  if (key === 'KeyM') toggleMute()
  if (!run) return
  const g = run.game
  // Co-op never pauses the world: the menu opens over it.
  if ((key === 'Escape' || key === 'KeyP') && run.coop) run.coop.menu = true
  else if ((key === 'Escape' || key === 'KeyP') && g.phase === 'playing') g.phase = 'paused'
  if (key === 'Space') queueSpecial()
  if (key === 'KeyE') queueMega()
  if (key === 'ShiftLeft' || key === 'ShiftRight') queueLunge()
})
// Touch only counts as a user activation on pointerup/touchend (not pointerdown).
for (const type of ['pointerdown', 'pointerup', 'touchend'] as const) window.addEventListener(type, unlockAudio)

/* ---------------- Browser chrome ---------------- */

// No pinch/double-tap zoom, pull-to-refresh, rubber-banding or long-press menus.
// CSS `touch-action` covers most browsers; these guards cover iOS Safari quirks.
// A one-finger drag still scrolls inside a screen or the Kecleon Shop's panel, which lives over the plaza, outside any screen.
const blockDefault = (e: Event) => e.preventDefault()
document.addEventListener('contextmenu', blockDefault)
document.addEventListener('gesturestart', blockDefault)
document.addEventListener(
  'touchmove',
  (e) => {
    const inScrollable = e.target instanceof Element && e.target.closest('.screen, .shop-sheet')
    if (e.touches.length > 1 || !inScrollable) e.preventDefault()
  },
  { passive: false },
)

document.addEventListener('visibilitychange', () => {
  // Co-op: hidden, the run isn't simulated and nothing is sent (the relay calls the seat away); back, it catches up.
  coopClient()?.setHidden(document.hidden)
  if (document.hidden && !run?.coop && run?.game.phase === 'playing') run.game.phase = 'paused'
})

/**
 * Asks before closing or reloading the tab while a run is on (paused and
 * level-up included; the results screen isn't). Every page navigation the
 * game makes (signing in, the guide, the title's links) starts from a menu,
 * with no run, so none of them is asked. iOS Safari ignores this prompt.
 */
window.addEventListener('beforeunload', (e) => {
  if (!run || run.game.phase === 'gameover' || run.game.phase === 'victory') return
  e.preventDefault()
  e.returnValue = true
})

/* ---------------- Co-op ---------------- */

/** The co-op client's events the shell acts on, wired once (`watchCoop`). */
let watchingCoop = false

/** Banks this player's share of a co-op run (deltas, never twice: `coop/bank.ts`). */
const bankCoop = (r: Run, c: CoopRun, withBonus: boolean) => {
  const g = c.runner.game
  bankCoopRun(g, c.runner.room, c.runner.start.id, c.runner.slot, withBonus, r.dexBase)
  void syncSave()
}

/** Leaves the co-op run's shell (not the room): banks what's due, drops the HUD. */
const endCoopRun = (r: Run, c: CoopRun) => {
  bankCoop(r, c, wonRun(c.runner.game) || coopOver(c.runner.game))
  r.overlay?.dispose()
  r.closeText?.()
  r.hud.dispose()
  c.hud.dispose()
  clearToasts(ui)
  run = null
  syncRunWatch()
}

/** Leaves the room for good (the Pokémon leaves the field), back to the title. */
const leaveCoopRun = () => {
  const c = run?.coop
  if (run && c) bankCoop(run, c, wonRun(c.runner.game) || coopOver(c.runner.game))
  coopClient()?.leave()
  removeBots()
  linkRoom(null)
  showTitle()
}

/**
 * Enters a co-op run the client is in (it began, or this tab joined it):
 * loads every player's family and the run's opening, then shows it. The
 * client keeps stepping the run meanwhile (`frame`).
 */
const startCoopRun = async (client: CoopClient, runner: Runner) => {
  if (run?.coop?.runner === runner) return
  setScreen(null)
  endRun()
  const loading = loadingScreen()
  ui.append(loading)
  const g = runner.game
  const families = [...new Set(g.players.flatMap((p) => familyDex(p.starter)))]
  const opening = rosterSchedule(g.roster).flatMap((s) => (s.at === 0 ? [s.dex] : []))
  await loadAll([...families, ...opening])
  await Promise.all(g.players.filter((p) => p.shiny).map((p) => preloadShinies(familyDex(p.starter)).catch(() => {})))
  loading.remove()
  // The run may have moved on while loading (a heal, a newer run): show the client's current one.
  const live = client.state().runner
  if (!live || run?.coop?.runner === live) return
  if (run) endRun()
  const save = loadSave()
  const view = createDrawView(live.game)
  const c: CoopRun = {
    client,
    runner: live,
    view,
    prediction: createPrediction(),
    hud: createCoopHud(ui),
    driver: coopDriver(client, () => showTitle()),
    sent: null,
    menu: false,
    banked: { victory: false, over: false },
    voted: false,
  }
  const me = localPlayer(live.game)
  run = {
    game: live.game,
    hud: runHud(view.game, () => (c.menu = true)),
    overlay: null,
    shown: null,
    closeText: null,
    paid: 0,
    reported: false,
    missionsBefore: missionStatus(save.missions, today()),
    recorded: null,
    unlocked: [],
    reward: 0,
    rewardEggs: 0,
    rewardItems: [],
    candies: 0,
    hatchery: { steps: 0, eggs: 0 },
    convertedEggs: { full: [], cap: [] },
    dexBase: save.dex,
    // Co-op runs aren't ranked: the recorder only fills the run's shape.
    recorder: startRecording({ seed: live.start.seed, starter: me.starter, difficulty: live.game.difficulty, ranks: me.ranks, shiny: me.shiny, luckyEgg: false, outbreak: null, halloween: false, bag: [], view: { ...live.game.view } }),
    ranked: null,
    rank: null,
    bestBefore: save.achievements.lifetime.bestTime,
    challenge: null,
    companion: null,
    // Every teammate's family stays loaded; the cast streams in like a solo run's.
    sprites: { needs: castNeeds(live.game.roster, EXTRAS), always: [...new Set(live.game.players.flatMap((p) => familyDex(p.starter)))] },
    coop: c,
  }
  syncSprites()
  resetCanvasPeaks()
  resetRunFrames(frames)
  syncRunWatch()
  track('run_start', { starter: me.starter, difficulty: live.game.difficulty, mode: 'standard' })
}

/** A co-op toast with a teammate's name (the shell's own player reads "You"). */
const mateName = (g: Game, slot: number) => (slot === localPlayer(g).slot ? t().coop.you : g.coop?.names[slot] || PLAYABLE[g.players[slot]?.starter ?? 'pichu'].name)

/** The co-op events of the simulation the shell shows its own way: teammates fainting, reviving, going away, leaving. */
const coopEvent = (r: Run, c: CoopRun, e: GameEvent, actor: number) => {
  const g = c.view.game
  const m = t().coop
  switch (e.kind) {
    case 'fainted':
      playSfx('hurt')
      return toast(ui, m.fainted(mateName(g, e.slot)), 2600)
    case 'revived':
      playSfx('heal')
      return toast(ui, m.revived(mateName(g, e.slot), mateName(g, e.by)), 2600)
    case 'away':
      return e.slot === c.runner.slot ? undefined : toast(ui, e.away ? m.away(mateName(g, e.slot)) : m.back(mateName(g, e.slot)), 2200)
    case 'left':
      return toast(ui, m.left(mateName(g, e.slot)), 2600)
    case 'gameover':
      playSfx('gameOver')
      return playCry(playerCry(g))
    case 'victory':
      return playSfx('evolve')
    case 'vote':
    case 'voted':
      return
    default:
      if (coopEventFor(g, e, actor)) handleEvent(r, e)
  }
}

/** Wires the co-op client's events to the shell, once. */
const watchCoop = (client: CoopClient) => {
  if (watchingCoop) return
  watchingCoop = true
  client.on((e) => {
    const c = run?.coop
    switch (e.kind) {
      case 'run':
        if (e.why === 'start' || !c || c.runner.start.id !== e.runner.start.id) void startCoopRun(client, e.runner)
        else c.runner = e.runner
        return
      case 'game':
        // A restore: the runner's game is a new object; the drawn copy follows it every frame.
        if (c && run) {
          c.runner = e.runner
          run.game = e.runner.game
          c.prediction = createPrediction()
          run.shown = null
        }
        return
      case 'healed':
        reportHeal(client.state().code ?? '', e.tick, e.ms)
        return toast(ui, t().coop.healed, 2200, 'coopHealed')
      case 'slow':
        return toast(ui, t().coop.slow, 2200, 'coopSlow')
      case 'room':
        if (!run && e.room.phase !== 'playing') {
          const code = e.room.code
          toast(ui, t().coop.lobby(code, e.room.members.length), 3200, 'coopLobby')
        }
        return
      case 'status':
        if (e.status.kind === 'closed' && e.status.why !== 'left') {
          const why = e.status.why
          if (run?.coop) endRun()
          linkRoom(null)
          showTitle()
          return void later(() => toast(ui, t().coop.closed[why], 6000, 'coopClosed'))
        }
        return
    }
  })
}

/** Joins a co-op room (a link, `ps.coop('join', code)`): sets this player's loadout, ready unless hosting. */
const joinCoop = async (code: string) => {
  const client = coopClient()
  if (!client) return { ok: false as const, why: 'offline' as const }
  watchCoop(client)
  const res = await client.join(code)
  if (!res.ok) return res
  linkRoom(code)
  const save = loadSave()
  // The Legend mode stays solo (`COOP_LOCKS`): a legend partner brings the first starter instead.
  const starter = PLAYABLE_IDS.find((id) => id === save.partner) ?? PLAYABLE_IDS[0]!
  client.setLoadout({ starter, ranks: save.ranks, shiny: playsShiny(save, starter) })
  const me = res.room.members.find((m) => m.seat === res.seat)
  if (me && !me.host) client.setReady(true)
  return res
}

/** A co-op run's display frame: the stick, the presses, the lockstep, the prediction, then the copy that's drawn. */
const coopFrame = (r: Run, c: CoopRun, dt: number, t: number) => {
  const client = c.client
  const g = c.runner.game
  r.game = g
  const me = localPlayer(g)
  // The stick reads still while a menu or a screen is up.
  const still = c.menu || phaseOf(g, me) !== 'playing'
  c.driver.advance(g, dt, { move: still ? { x: 0, y: 0 } : input.readMove(), special: specialQueued, mega: megaQueued, lunge: lungeQueued })
  specialQueued = megaQueued = lungeQueued = false
  const runner = c.runner
  const st = client.state()
  const drawn = predict(c.prediction, runner, st.history, st.sample, c.driver.frac(), dt)
  const shown = updateDrawView(c.view, runner, drawn, view, runner.acc / STEP)
  const conn = client.connection()
  // Sounds and toasts wait out a sync (the run is replaying, not happening now).
  const quiet = conn.syncing !== null
  const actors = runner.actors.splice(0)
  runner.events.splice(0).forEach((e, i) => !quiet && coopEvent(r, c, e, actors[i] ?? 0))
  if (run !== r) return
  // Banks at the victory and at the end (deltas: a reload or a second time pays nothing).
  if (!c.banked.victory && runner.game.phase === 'victory') {
    c.banked.victory = true
    bankCoop(r, c, true)
  }
  if (!c.banked.over && coopOver(runner.game)) {
    c.banked.over = true
    bankCoop(r, c, true)
  }
  syncOverlay(r)
  tickToasts(ui, dt, false)
  render(ctx, shown, t, { ...settings(), companion: null, mates: c.view.mates })
  const stick = input.readStick()
  if (stick && shown.phase === 'playing') drawJoystick(ctx, stick, cssScale)
  r.hud.update(shown)
  // The team waits on a teammate's level-up: whose timer, and how long it has.
  const busy = shown.phase === 'levelup' && phaseOf(shown, localPlayer(shown)) === 'playing' ? shown.players.filter(onScreen) : []
  const waiting = busy.length > 0 ? Math.max(...busy.map((p) => p.pickLeft)) : null
  c.hud.update(conn, waiting, runner.pending !== null)
}

/* ---------------- Loop ---------------- */

let last = performance.now()
/** The simulation's tick accumulator, snapped to the display's cadence (`engine/pacing.ts`). */
const pace = pacer()
/** Watches how the run's frames hold up and turns lean drawing on and off (`render/quality.ts`). */
const governor = createGovernor((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
detail.lean = governor.lean
/** `ps.quality()` pins the governor's choice for screenshots and tests. */
let qualityPin: 'auto' | 'lean' | 'full' = 'auto'
/** When the last frame that advanced the run was drawn (NaN after one that didn't). */
let lastDrawn = NaN
/** Seconds of menu time not drawn yet: the menus' meadow and screens draw at most about 60 times a second. */
let menuAcc = 0

/**
 * One display frame. It books the next one first: an exception thrown in here
 * still reaches the error report (once, `analytics.ts` dedupes it) but never
 * stops the loop, which would freeze the game for good.
 */
const frame = (now: number) => {
  requestAnimationFrame(frame)
  const started = performance.now()
  recordFrame(frames, now - last, run?.game.phase === 'playing')
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const t = now / 1000
  // Gamepads type the keyboard's codes: menus get confirm/back, a run its special, Mega and lunge.
  input.poll(run?.game.phase === 'playing')
  setActivePad(input.activePad())

  // Co-op keeps its socket and lockstep going behind menus and loading screens too.
  const coop = run?.coop ?? null
  if (!coop) {
    const client = coopClient()
    if (client && client.state().status.kind !== 'idle') client.frame(dt)
  }
  if (run && coop) coopFrame(run, coop, dt, t)
  else if (run) {
    const r = run
    const g = r.game
    let steps = 0
    if (g.phase === 'playing' || g.phase === 'evolving') {
      advancePacer(pace, dt, STEP)
      // A level-up or a faint ends the frame's steps: the ones left over would go into the replay as ticks the run never played.
      while (pace.acc >= STEP && (g.phase === 'playing' || g.phase === 'evolving')) {
        // The simulation gets the stick as the replay stores it (`moveCode`), so a re-simulation sees the same run.
        if (specialQueued) recordEvent(r.recorder, ['special'])
        if (megaQueued) recordEvent(r.recorder, ['mega'])
        if (lungeQueued) recordEvent(r.recorder, ['lunge'])
        step(g, { move: recordStep(r.recorder, view, input.readMove()), special: specialQueued, mega: megaQueued, lunge: lungeQueued }, STEP)
        specialQueued = false
        megaQueued = false
        lungeQueued = false
        pace.acc -= STEP
        steps++
      }
      // A ranked run's replay goes to the API in chunks as it plays.
      if (steps > 0) r.ranked?.stream(r.recorder)
    } else {
      resetPacer(pace)
      specialQueued = false
      megaQueued = false
      lungeQueued = false
    }
    // A level-up with only the Oran Berry to pick takes it without a screen, recorded like a tap.
    const berries = takeBerryLevelUps(g, (i) => recordEvent(r.recorder, ['offer', i]))
    for (const e of g.events.splice(0)) handleEvent(r, e)
    if (berries > 0) berryToast(g, berries)
    if (run === r) {
      syncOverlay(r)
      // Toasts and banners wait out menus, level-ups and evolutions with their clocks stopped.
      tickToasts(ui, dt, g.phase !== 'playing')
      // Redraw only when the simulation advanced: halves the work on 120 Hz phones and
      // idles the GPU while a menu is open over a frozen frame.
      if (r.companion && steps > 0) stepCompanion(r.companion, localPlayer(g), steps * STEP)
      if (steps > 0 || dirty) {
        dirty = false
        render(ctx, g, t, { ...settings(), companion: r.companion })
        const stick = input.readStick()
        if (stick && g.phase === 'playing') drawJoystick(ctx, stick, cssScale)
        r.hud.update(g)
      }
      // Only frames that moved the run tell how the device keeps up.
      if (steps > 0) {
        const lean = observeFrame(governor, performance.now() - started, now - lastDrawn)
        detail.lean = qualityPin === 'auto' ? lean : qualityPin === 'lean'
        lastDrawn = now
      } else lastDrawn = NaN
    }
  } else {
    // On 90 and 120 Hz screens the menus draw at most about 60 times a second, like a run: half the work behind a menu.
    menuAcc += dt
  }
  const menuFrame = menuAcc >= STEP * 0.6
  if (!run && menuFrame) {
    const mdt = Math.min(0.1, menuAcc)
    menuAcc = 0
    // Attract mode: wild Pokémon stroll through the meadow behind the menus (haunted on the Noite das Bruxas).
    scene.haunted = halloweenToday()
    scene.plaza.level = plazaLevel()
    refreshVisitors(performance.now())
    stepTitleScene(scene, mdt, view.w, view.h)
    drawTitleScene(ctx, scene, view.w, view.h)
    ctx.fillStyle = `rgba(16,24,48,${screen?.dim ?? 0.35})`
    ctx.fillRect(0, 0, view.w, view.h)
    if (meadowStick) drawJoystick(ctx, meadowStick, cssScale)
    // The wild Pokémon the partner greets answer with their cry.
    for (const dex of scene.cries.splice(0)) playCry(cryUrl(dex), 0.3)
    // Menu news (what a quit run completed) shares the run's queue. Banners (Mystery Gifts) wait
    // for the bare title: over the starter select or a dialog they'd cover what the player is reading.
    tickToasts(ui, mdt, false, !ui.querySelector(':scope > .title-home:not(.hidden)') || ui.querySelector(':scope > .screen.dim:not(.hidden)') !== null)
  }
  if (run || menuFrame) screen?.tick?.(t)
  playTheme(themeFor(run))
  // Ducked under the pause menu, but at full level while the player tunes the volume.
  duckMusic(run?.game.phase === 'paused' && !isSettingsOpen())
}

/* ---------------- Idle warm-up ---------------- */

/** Frame slack (ms) a warm-up step waits for, so it fits before the next frame. */
const IDLE_SLACK = 6
const hasIdle = 'requestIdleCallback' in window

/**
 * Sculpts terrain sprites (`warmScenery`) and makes the level-up icons (`warmIcon`)
 * in the browser's idle time, as many as the frame's slack allows, so neither
 * stalls a frame the first time it shows. Once all are made it checks again
 * every second (the run moves on to new biomes). Without `requestIdleCallback`
 * (Safari), one per timer.
 */
const pumpWarmUp = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => {
  // Menus and level-ups are calm (an evolution isn't: it plays on the canvas): what no frame waits on yet (other biomes) is built there.
  const calm = !run || (run.game.phase !== 'playing' && run.game.phase !== 'evolving')
  const warm = () => warmScenery(run?.game ?? null, calm) || warmIcon()
  let made = false
  // A build that throws (reported as any error) must not stop the warm-up for the rest of the session.
  try {
    if (deadline.didTimeout) made = warm()
    else while (deadline.timeRemaining() > IDLE_SLACK && warm()) made = true
  } finally {
    scheduleWarmUp(made ? (hasIdle ? 0 : 50) : 1000)
  }
}
const scheduleWarmUp = (ms: number) =>
  setTimeout(() => {
    if (hasIdle) requestIdleCallback(pumpWarmUp, { timeout: 2000 })
    else pumpWarmUp({ didTimeout: true, timeRemaining: () => 0 })
  }, ms)

/* ---------------- Boot ---------------- */

/** A shared profile link (`/?u=handle`): the game opens on that profile, and closing it leaves the link. */
const showSharedProfile = (handle: string) => {
  setScreen(
    profileScreen(ui, input, handle, () => {
      history.replaceState(null, '', location.pathname)
      showTitle()
    }),
  )
}

/** `?ideias`, the idea board's own link (to share on social media): it opens over the lobby, and closing it lands there. */
const IDEAS_PARAM = 'ideias'
/** `?loja`, the Kecleon's shop's own link: the lobby opens at the plaza, Kecleon says hello and the shop opens. */
const SHOP_PARAM = 'loja'

const showIdeasLink = () =>
  setScreen(
    suggestionsScreen(ui, input, () => {
      history.replaceState(null, '', location.pathname)
      showTitle({ focus: 'ideas' })
    }),
  )

/**
 * Right after the first sign in on a device (no handle yet), the title gives
 * way to the profile editor, so the player picks how they show up on the ranking.
 */
const promptProfile = () => {
  let asked = false
  onAccountChange((s) => {
    if (asked || s.kind !== 'signedIn' || s.handle !== null || run || !screen?.el.classList.contains('title-home')) return
    asked = true
    setScreen(profileEditor(ui, input, () => showTitle()))
  })
}

/** Set when a newer build is live and a run held off the reload: the next trip to the lobby, or the next run, reloads. */
let reloadForDeploy = false

/** Whether the site now serves another build: the page's HTML, fetched fresh, misses one of this page's scripts. False offline. */
const newerBuild = async () => {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((s) => new URL(s.src).pathname)
  const html = await fetch(location.pathname, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : null), () => null)
  return html !== null && scripts.some((path) => !html.includes(path))
}

/** Reloads into a newer build when one is live: right away in the menus (the save is local), or once the run is over. */
const loadNewerBuild = () =>
  void newerBuild().then((newer) => {
    if (!newer) return
    if (run) reloadForDeploy = true
    else location.reload()
  })

/**
 * Each deploy renames the chunks loaded on demand (Novidades, Clerk) and drops
 * the old ones, so a game opened before it can't load them anymore: when a
 * chunk fails, load the newer build. Same when the API plays newer rules than
 * this build (a ticket says so, or a result came back `outdated`): every
 * ranked run this build plays would be refused.
 */
const watchDeploys = () => {
  addEventListener('vite:preloadError', loadNewerBuild)
  onRulesBehind(loadNewerBuild)
}

/** Counts a run the page died in, once, whether or not the player reports it: rare enough for an event of its own. */
const reportCrash = (c: BugCrash) =>
  track('run_crash', {
    version: c.version,
    sameVersion: c.version === __GAME_VERSION__,
    at: c.at,
    partner: c.run?.partner ?? null,
    phase: c.run?.phase ?? null,
    minute: c.run ? Math.floor(c.run.time / 60) : null,
    enemies: c.run?.enemies ?? null,
    projectiles: c.run?.projectiles ?? null,
    wave: c.run?.wave || null,
    boss: c.run?.boss || null,
    place: c.run?.place || null,
    heapMb: c.heapMb,
    canvases: c.perf?.canvases ?? null,
    canvasMb: c.perf?.canvasMb ?? null,
    peakCanvasMb: c.perf?.peakCanvasMb ?? null,
    frameMs: c.perf?.frameMs ?? null,
    deviceMemory: deviceMemory(),
    error: c.error?.message ?? null,
  })

/** The game closed mid-run last time (`takeCrash`): the title asks, once, whether to report it. */
const askAboutCrash = () => {
  const crash = takeCrash()
  if (crash) reportCrash(crash)
  if (!crash || !bugReportsEnabled || !screen?.el.classList.contains('title-home')) return
  crashPrompt(screen.el, () => setScreen(bugReportForm(ui, input, () => showTitle(), crash)))
}

const boot = () => {
  startAnalytics(errorContext)
  watchDeploys()
  // Events and errors tie to the account on this device, known from its link before Clerk loads.
  const identifyAccount = () => identify(accountUserId(), accountHandle())
  identifyAccount()
  onAccountChange(identifyAccount)
  document.documentElement.lang = LOCALES[locale()].tag
  // Someone's link (`?ref=`, a profile): remember who brought this device, before anything reads the URL.
  captureRef()
  const shared = rankingEnabled ? parseHandle(new URLSearchParams(location.search).get(PROFILE_PARAM)) : null
  if (shared) showSharedProfile(shared)
  else if (rankingEnabled && new URLSearchParams(location.search).has(IDEAS_PARAM)) showIdeasLink()
  else if (new URLSearchParams(location.search).has(SHOP_PARAM)) showTitle({ shop: 'shop', instant: true })
  // Back from signing in, the player already pressed start before leaving: straight to the menu.
  else showTitle({ intro: !backFromSignIn() })
  askAboutCrash()
  requestAnimationFrame(frame)
  scheduleWarmUp(1000)
  // The menus' sheets stream in one at a time, so the title stays responsive; from then on the stream follows the run.
  syncSprites()
  setInterval(syncSprites, SPRITE_SYNC)
  promptProfile()
  // Coming back to the game syncs again, but not mid-run: a run syncs when it ends.
  startAccount(() => run === null)
  // A co-op link (`?sala=K7QF2`): join that room; in a run, by snapshot, on the same seat after a reload.
  const room = linkedRoom()
  if (room && coopUrl()) void joinCoop(room)
  // Results that didn't reach the ranking last time (offline) go now, once the account is back.
  if (accountState().kind === 'signedIn') setTimeout(() => void flushRuns(), 5000)
}

boot()

/** Dev: places a map event `dx`, `dy` px from the player, e.g. `ps.event('chest')`. */
const devEvent = (kind: MapEventKind, dx = 70, dy = 0) => {
  if (!run || !MAP_EVENT_KINDS.includes(kind)) return `Kinds: ${MAP_EVENT_KINDS.join(', ')}`
  const p = localPlayer(run.game)
  return spawnMapEvent(run.game, kind, Math.round(p.x + dx), Math.round(p.y + dy))
}

/** Dev: starts a field mission of `kind` about `dx` px to the right of the player, e.g. `ps.field('defense')`. */
const devField = (kind: FieldMissionKind = 'defense', dx = 120) => {
  if (!run || !FIELD_MISSION_KINDS.includes(kind)) return `Kinds: ${FIELD_MISSION_KINDS.join(', ')}`
  const p = localPlayer(run.game)
  return spawnMapEvent(run.game, kind, Math.round(p.x + dx), Math.round(p.y))
}

// Dev-only handle for poking at the running game from the console.
/** Dev: spawns `count` of an enemy in a small arc ahead of the player (staging trait screenshots); `shiny` makes them shiny elites. */
const devSpawn = (kind: EnemyId, count = 1, shiny = false) => {
  const g = run?.game
  if (!g) return
  const p = localPlayer(g)
  const base = Math.atan2(p.facing.y, p.facing.x)
  for (let i = 0; i < count; i++) {
    const a = base + (i - (count - 1) / 2) * 0.35
    const e = spawnEnemy(g, kind, p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90)
    if (shiny) {
      void preloadShinies([ENEMIES[kind].dex])
      makeShiny(g, e)
    }
  }
}

/** Dev: an Alpha 120 px ahead (`ps.alpha('golem')`; the stage's own pick without an argument). */
const devAlpha = (kind?: EnemyId) => {
  const g = run?.game
  if (!g) return 'ps: start a run first'
  const id = kind ?? pickAlpha(g.rng, g.roster.stages[stageIndexAt(g.time)] ?? [])
  if (!id) return 'ps: no species for an Alpha in this stage'
  const p = localPlayer(g)
  return spawnAlpha(g, id, p.x + p.facing.x * 120, p.y + p.facing.y * 120)
}

/**
 * Dev: stages the run's Mega Evolution. `now` (default) jumps to the final stage with
 * the stone of `mega` (the line's first Mega by default) and presses the Mega button;
 * `ready` stops before the press; `stone` drops the line's stones 40 px to the right
 * instead, as a rift would.
 */
const devMega = (mode: 'now' | 'ready' | 'stone' = 'now', mega?: MegaId) => {
  const g = run?.game
  const ids = g ? megasOf(localPlayer(g).starter) : []
  if (!g || !ids[0]) return `Start a run with a Mega line: ${MEGA_LINES.join(', ')}`
  const p = localPlayer(g)
  if (mode === 'stone') return dropMegaStones(g, p.x + 40, p.y)
  if (mega && !ids.includes(mega)) return `${PLAYABLE[localPlayer(g).starter].name}'s Megas: ${ids.join(', ')}`
  const pick = mega ?? ids[0]
  // A branch's Mega (Gallade's) needs its branch.
  localPlayer(g).branch = MEGA_BRANCH[pick] ?? localPlayer(g).branch
  p.stage = PLAYABLE[localPlayer(g).starter].line.length - 1
  p.radius = Math.max(6, Math.round(bodyOf(playerDex(g)).bodyW * 0.3))
  recomputeStats(g)
  localPlayer(g).mega.stone = null
  grantStone(g, pick)
  localPlayer(g).mega.charge = 0
  if (mode === 'now') queueMega()
}

/**
 * Dev: the evolution picks. `ps.evolve()` levels up to the next evolution, asking
 * where a branching one goes; `ps.evolve('vaporeon')` takes that branch straight away.
 */
const devEvolve = (branch?: BranchId) => {
  const g = run?.game
  if (!g || g.phase !== 'playing') return 'Start a run (and close menus) first'
  const stage = formAt(localPlayer(g).starter, localPlayer(g).branch, localPlayer(g).stage)
  if (stage.evolveAt === undefined) return 'Already at the final stage'
  if (branch) localPlayer(g).branch = branch
  localPlayer(g).level = Math.max(localPlayer(g).level, stage.evolveAt)
  localPlayer(g).xp = 0
  localPlayer(g).xpNext = xpFor(localPlayer(g).level)
  advancePhase(g)
}

/** Dev: `ps.ability()` opens the ability pick now; `ps.ability('blaze')` takes that one. */
const devAbility = (id?: AbilityId) => {
  const g = run?.game
  if (!g) return
  if (!id) return offerAbilities(g)
  grantAbility(g, id)
  recomputeStats(g)
  return localPlayer(g).ability
}

/** Dev: eggs and hatching, to stage the incubator and the hatching scene. */
const devEggs = {
  /** Puts an egg in the incubator (a full one pays its ₽), like a mission reward. */
  egg: (tier: EggTier = 'common') => {
    const { save } = grantEgg(loadSave(), tier)
    writeSave(save)
    return save.eggs
  },
  /** Walks every incubating egg `steps` (all the way by default). */
  walk: (steps = 99999) => {
    const { save } = depositEggs(loadSave(), steps, [])
    writeSave(save)
    return save.eggs
  },
  /** Hatches every ready egg now, or plays the scene for `id` (unlocking it), held at `holdAt` seconds if given. */
  hatch: (id?: HatchlingId, shiny = false, holdAt?: number) => {
    if (!id) return afterRun(() => showMenu())
    const save = loadSave()
    writeSave({ ...save, hatched: { ...save.hatched, [id]: { shiny } } })
    endRun()
    showHatch({ id, tier: HATCHLINGS[id].egg, shiny, duplicate: false, refund: 0 }, () => showMenu(id), holdAt)
  },
  incubator: () => showIncubator(() => showMenu()),
  /** Unlocks the shiny of a Pokémon (every one without an argument), as if its 1/64 roll hit. */
  unlockShiny: (id?: PlayableId) => {
    const save = loadSave()
    const ids = id ? [id] : (Object.keys(PLAYABLE) as PlayableId[])
    writeSave({ ...save, shinyStarters: ids.reduce(unlockShinyStarter, save.shinyStarters) })
  },
  /** Unlocks a family (every family without an argument). */
  unlockFamily: (id?: HatchlingId, shiny = false) => {
    const save = loadSave()
    const ids = id ? [id] : HATCHLING_IDS
    writeSave({ ...save, hatched: { ...save.hatched, ...Object.fromEntries(ids.map((i) => [i, { shiny }])) } })
  },
  save: loadSave,
}

/** Dev: Mystery Gifts and invites, to stage the lobby's gift box, the Ambassador's rewards and the title's invite banner. */
const devGifts = {
  /**
   * Puts a Mystery Gift in the lobby's gift box as if a sync listed it: `ps.gift('egg', 'friend')`, `ps.gift('coins', '500')`,
   * `ps.gift('title')`, `ps.gift('style', 'ambassador')` (a frame), `ps.gift('shinyHatch', 'munchlax')`,
   * `ps.gift('ribbon', 'gold')` (yesterday's challenge, #12 of 340), `ps.gift('shinyPick')` (a shiny of one's choice),
   * `ps.gift('companion', 'pumpkaboo')` (a gift-only companion).
   * `why`: an inviter's handle (welcome) or a count of friends brought.
   */
  gift: (kind: GiftKind = 'egg', arg?: string, why?: string | number) => {
    const raw = { egg: { tier: arg ?? 'friend' }, coins: { amount: Number(arg ?? 500) }, title: { title: arg ?? 'ambassador' }, style: { style: { slot: 'frame', id: arg ?? 'ambassador' } }, shinyHatch: { family: arg ?? 'munchlax' }, ribbon: { ribbon: { day: previousDay(brasiliaDay(today())), tier: arg ?? 'gold', rank: 12, total: 340 } }, shinyPick: {}, companion: { id: arg ?? 'pumpkaboo' } }[kind]
    const content = parseGiftContent({ kind, ...raw })
    if (!content) return 'Kinds: egg (tier), coins (amount), title, style (frame id), shinyHatch (family), ribbon (tier), shinyPick, companion (id)'
    const reason: GiftReason | null = typeof why === 'number' ? { kind: 'friends', count: why } : why ? { kind: 'welcome', from: why } : null
    return stageGifts([{ id: `dev-${Date.now()}`, content, reason }])
  },
  /** Puts the thank-you for joining the Discord (`DISCORD_GIFT`) in the gift box, as if linking brought it. */
  discordGift: () => stageGifts([{ id: `dev-discord-${Date.now()}`, content: DISCORD_GIFT, reason: { kind: 'discord' } }]),
  /**
   * Puts a supporter's thank-you in the gift box as Mystery Gifts in one sync, as if a donation was credited: `supporter`
   * brings the title, the frame and a shiny ticket; `gold` every tier up to gold (a first donation of R$ 50).
   */
  supporter: (tier: SupporterTier = 'supporter') =>
    stageGifts(
      SUPPORTER_TIERS.slice(0, SUPPORTER_TIERS.indexOf(tier) + 1).flatMap((t) =>
        TIER_GIFTS[t].map((content, i) => ({ id: `dev-support-${t}-${i}-${Date.now()}`, content, reason: { kind: 'support', tier: t } as const })),
      ),
    ),
  /** Takes `id` along as the companion (`shiny` if owned so; a gift-only one like `pumpkaboo` must be owned); no argument walks alone. Shows from the next run. */
  companion: (id?: CompanionId, shiny = false) => updateSave((s) => ({ ...s, companion: id ? { id, shiny } : null })),
  /** Lands as a guest invited by `handle` (shown as `name`): the title shows the invite banner. */
  invite: (handle = 'ash', name = 'Ash') => {
    stageInvite(handle, name)
    if (screen?.el.classList.contains('title-home')) showTitle()
  },
}

/**
 * Dev: the Desafio do dia. `ps.challenge()` opens its screen, `'play'` starts
 * today's run, `'done'` marks this device's attempt as made (`time` seconds),
 * `'reset'` forgets it. Returns today's challenge.
 */
const devChallenge = (mode?: 'play' | 'done' | 'reset', time = 754) => {
  const c = challengeToday()
  if (mode === 'play') void replayChallenge()
  else if (mode === 'done') saveAttempt({ day: c.day, time })
  else if (mode === 'reset') saveAttempt(null)
  if (mode !== 'play' && !run) showChallenge()
  return c
}

/**
 * Dev: lands a sync as if another device of the account played today's
 * challenge (`time` seconds, its official attempt) and earned `coins` ₽, so
 * the lobby shows it without a reload. Returns the save.
 */
const devOtherDevice = (coins = 1000, time = 754) => {
  const save = loadSave()
  stageSyncedSave({ ...save, wallet: save.wallet + coins, attempt: { day: challengeToday().day, time } })
  return loadSave()
}

/**
 * Dev: walks the player to the nearest piece of terrain of a kind (`rock`,
 * `tree`, `cliff`, `tower` or `lake`), standing `dy` px south of it, e.g. `ps.terrain('cliff')`.
 */
const devTerrain = (g: Game, kind: SolidKind | 'lake' = 'cliff', dy = 70) => {
  const C = TERRAIN.cell
  const pcx = Math.floor(localPlayer(g).x / C)
  const pcy = Math.floor(localPlayer(g).y / C)
  for (let r = 0; r < 30; r++) {
    for (let cy = pcy - r; cy <= pcy + r; cy++) {
      for (let cx = pcx - r; cx <= pcx + r; cx++) {
        if (Math.max(Math.abs(cx - pcx), Math.abs(cy - pcy)) !== r) continue
        const f = featureAt(g.terrain.seed, cx, cy)
        const spot = kind === 'lake' ? f?.lake : f?.solids.find((s) => s.kind === kind)
        if (!spot) continue
        const at = clearSpot(g, { x: spot.x, y: spot.y + dy }, localPlayer(g).radius + 2)
        localPlayer(g).x = at.x
        localPlayer(g).y = at.y
        return f
      }
    }
  }
  return null
}

/** Walks the player to the nearest landmark of a kind (any without one), `dy` px south of its anchor. */
const devLandmark = (g: Game, id?: LandmarkId, dy = 60) => {
  const C = TERRAIN.cell
  const pcx = Math.floor(g.player.x / C)
  const pcy = Math.floor(g.player.y / C)
  for (let r = 0; r < 40; r++) {
    for (let cy = pcy - r; cy <= pcy + r; cy++) {
      for (let cx = pcx - r; cx <= pcx + r; cx++) {
        if (Math.max(Math.abs(cx - pcx), Math.abs(cy - pcy)) !== r) continue
        const lm = featureAt(g.terrain.seed, cx, cy)?.landmark
        if (!lm || (id && lm.id !== id)) continue
        const at = clearSpot(g, { x: lm.x, y: lm.y + dy }, g.player.radius + 2)
        g.player.x = at.x
        g.player.y = at.y
        return lm
      }
    }
  }
  return null
}

/**
 * Dev: co-op without the lobby (PR 7). `ps.coop()` shows the client's state;
 * `ps.coop('create', 2)` makes a room, joins it and adds two bots (same tab,
 * each a full client); `ps.coop('join', 'K7QF2')`, `('bots', n)`, `('ready')`,
 * `('start')` (the host), `('leave')`; `('drop')` cuts the socket as a network
 * failure would, `('fresh')` rejoins as a new tab (the snapshot), `('desync')`
 * nudges this client's state off the team's (the relay heals it), `('url', u)`
 * points at another relay (null: the default), `('net')` the connection numbers.
 */
const devCoop = async (cmd?: string, arg?: string | number | null) => {
  const client = coopClient()
  if (!client) return 'ps.coop: no relay (VITE_COOP_URL)'
  watchCoop(client)
  const st = client.state()
  switch (cmd) {
    case undefined:
      return { status: st.status, code: st.code, seat: st.seat, room: st.room, tick: st.runner?.next, known: st.runner?.known, bots: botCount() }
    case 'create': {
      const made = await client.create()
      if (!made.ok) return made
      const joined = await joinCoop(made.code)
      if (joined.ok && Number(arg ?? 0) > 0) await addBots(made.code, Number(arg))
      return { ...made, joined }
    }
    case 'join':
      return joinCoop(String(arg ?? ''))
    case 'bots':
      return st.code ? addBots(st.code, Number(arg ?? 1)) : 'ps.coop: join a room first'
    case 'ready':
      return client.setReady(arg !== 0 && arg !== 'no')
    case 'start':
      return client.start()
    case 'leave':
      return leaveCoopRun()
    case 'drop':
      return client.drop()
    case 'fresh':
      return client.rejoinFresh()
    case 'desync':
      if (st.runner) st.runner.game.coins += 13
      return st.runner?.next
    case 'url':
      setCoopUrl(typeof arg === 'string' ? arg : null)
      return 'ps.coop: reload to use it'
    case 'wall': {
      // Read-only: the nearest solid's foot to this player, and whether the drawn or the confirmed sprite sits in one.
      const c = run?.coop
      if (!c) return null
      const g = c.runner.game
      const me = localPlayer(g)
      const d = c.prediction.drawn
      let best: { x: number; y: number; rx: number; ry: number; d: number } | null = null
      for (const f of featuresNear(g, me.x, me.y, 360)) for (const sol of f.solids) for (const e of sol.foot) {
        const dist = Math.hypot(e.x - me.x, e.y - me.y)
        if (!best || dist < best.d) best = { x: e.x, y: e.y, rx: e.rx, ry: e.ry, d: dist }
      }
      return { me: { x: me.x, y: me.y }, drawn: { ...d }, nearest: best, drawnIn: inSolid(g, d.x, d.y, me.radius - 1), confirmedIn: inSolid(g, me.x, me.y, me.radius - 1) }
    }
    case 'net': {
      const r = st.runner
      return { ...client.connection(), queued: client.queued(), stats: r?.stats, tickMs: r?.tickMs, slot: r?.slot, errors: run?.coop?.prediction.errors }
    }
    default:
      return 'ps.coop(): create, join, bots, ready, start, leave, drop, fresh, desync, url, net'
  }
}

// `ps.biome('cave')` and `ps.weather('rain')` stage a run for screenshots (they hold until the next scheduled change).
if (import.meta.env.DEV) {
  const withRun = (fn: (g: Game) => void) => (run ? fn(run.game) : console.warn('ps: start a run first'))
  Object.assign(window, {
    ps: {
      run: () => run,
      startRun,
      // Sheets loaded and frame silhouettes cached right now (`render/sprites.ts`).
      sprites: () => ({ loaded: loadedCount(), overlays: overlayStats() }),
      coop: devCoop,
      showTitle,
      showMenu,
      theme: currentTheme,
      /** `ps.quality('lean')` pins lean drawing (`'full'` full detail, `'auto'` back to the governor); returns the governor's state. */
      quality: (pin?: 'auto' | 'lean' | 'full') => {
        if (pin) qualityPin = pin
        detail.lean = qualityPin === 'auto' ? governor.lean : qualityPin === 'lean'
        return { pin: qualityPin, drawing: detail.lean ? 'lean' : 'full', governor: { ...governor } }
      },
      spawn: devSpawn,
      alpha: devAlpha,
      mega: devMega,
      evolve: devEvolve,
      ability: devAbility,
      event: devEvent,
      field: devField,
      challenge: devChallenge,
      otherDevice: devOtherDevice,
      dex: () => loadSave().dex,
      /** Plays an error report's `replay` (the JSON string from PostHog) again: a simulation error throws here at the same tick. */
      replay: (json: string) => {
        const replay = parseReplay(JSON.parse(json))
        if (!replay) return 'Not a replay'
        // The report's `version` is the commit to check out when the rules differ.
        if (rulesStanding(replay.rules) !== 'same') console.warn(`ps: the replay plays by rules ${replay.rules}, this build by ${RULES_VERSION}: it may end elsewhere`)
        return resimulate(replay)
      },
      /** The lobby's meadow: its wanderers, the partner and the camera, to stage greetings (`ps.meadow().partner`). */
      meadow: () => scene,
      /**
       * The Kecleon plaza: `ps.plaza(3)` shows the shop's building at that level (1 to 5, until the next reload; `ps.plaza(0)`
       * goes back to the save's) and the lobby pans there for a look, cards out; Esc or Enter comes back.
       */
      plaza: (level?: number) => {
        if (level === 0) devPlazaLevel = null
        else if (level !== undefined) devPlazaLevel = SHOP_LEVEL_IDS.find((l) => l === level) ?? devPlazaLevel
        showTitle({ shop: 'look' })
        return plazaLevel()
      },
      /**
       * Meowth's caravan: `ps.caravan(true)` forces it in (the next weekend day's stock, and the shop to the Kecleon Mart if
       * it's lower), `ps.caravan(false)` keeps it away, `ps.caravan()` goes back to the calendar; the lobby heads for it.
       */
      caravan: (on?: boolean) => {
        setDevCaravan(on ?? null)
        if (on) updateSave((s) => (s.shop.level >= CARAVAN.minLevel ? s : { ...s, shop: { ...s.shop, level: CARAVAN.minLevel } }))
        shopLevel = loadSave().shop.level
        visitorsAt = -1
        showTitle({ shop: 'look' })
        return plazaVisitors(loadSave())
      },
      /** Sets the loyalty card's stamps (`ps.stamps(7)`; one short of the next milestone without an argument). Returns the shop. */
      stamps: (n?: number) => {
        updateSave((s) => ({ ...s, shop: { ...s.shop, stamps: Math.max(0, n ?? (nextMilestone(s.shop.stamps)?.stamps ?? 101) - 1) } }))
        visitorsAt = -1
        showTitle()
        return loadSave().shop
      },
      /**
       * Puts a seasonal stall on the plaza (`ps.stall('halloween')`, `'christmas'`; `null` none; no argument: the calendar's) and
       * goes there; `ps.stall('halloween', true)` opens its shelf in the shop, as a talk with Duskull does.
       */
      stall: (id?: StallId | null, shop = false) => {
        if (id && !STALL_IDS.includes(id)) return `Stalls: ${STALL_IDS.join(', ')}`
        setDevStall(id)
        visitorsAt = -1
        showTitle(shop ? { shop: 'shop', shelf: 'stall' } : { shop: 'look' })
        return plazaVisitors(loadSave())
      },
      /** The camouflage easter egg on demand: the lobby goes to the shop and the counter looks empty until you talk. */
      surprise: () => {
        devSurprise = true
        showTitle({ shop: 'shop' })
      },
      /**
       * Noite das Bruxas: moves the missions' clock to an event day (`2026-10-31` by default; `ps.halloween('2026-10-22')` for the
       * countdown) and rebuilds the title; `ps.halloween(false)` goes back to now. Runs started then are haunted (dev only: the server
       * would refuse them). `ps.candies(500)` sets the candy jar; `ps.pumpkin()` puts a jack-o'-lantern 40 px to the right of the player.
       */
      halloween: (day: string | false = '2026-10-31') => {
        setToday(day ? new Date(`${day}T12:00-03:00`) : null)
        upcoming = planRun()
        void Promise.allSettled(HAUNT_DEX.map((dex) => loadSpecies(dex)))
        showTitle()
        return brasiliaDay(today())
      },
      candies: (n = 500) => {
        updateSave((s) => ({ ...s, halloween: { ...s.halloween, candies: n } }))
        showTitle()
        return n
      },
      /** `ps.ghostHunt(n)` ticks the first `n` night bosses off the Caça aos Fantasmas (one short of all by default, so the next one completes it; 0 clears it). */
      ghostHunt: (n = NIGHT_BOSSES.length - 1) => {
        const hunted = NIGHT_BOSSES.slice(0, Math.max(0, n))
        updateSave((s) => ({ ...s, halloween: { ...s.halloween, hunted } }))
        showTitle()
        return hunted
      },
      pumpkin: () => withRun((g) => g.props.push({ id: g.nextId++, cell: -1 - g.nextId, kind: 'pumpkin', x: g.player.x + 40, y: g.player.y, hp: 2, hitCooldown: 0, shake: 0 })),
      /** Opens the difficulty survey over the title, whatever the runs played; `ps.survey('reset')` forgets this device's answer. */
      survey: (mode?: 'reset') => {
        endRun()
        if (mode === 'reset') return (forgetSurvey(), showTitle())
        setScreen(surveyScreen(ui, input, () => showTitle({ focus: 'survey' })))
      },
      /** The Caixa do PC over the title; `ps.card()` opens the Trainer Card's share preview. */
      pc: () => (endRun(), setScreen(showPcBox(() => showTitle()))),
      card: (partner: PlayableId = loadSave().partner) => (endRun(), setScreen(sharePreview(ui, input, trainerShare(partner), () => showTitle()))),
      biome: (id: BiomeId) => withRun((g) => setBiome(g, id)),
      terrain: (kind?: SolidKind | 'lake', dy?: number) => (run ? devTerrain(run.game, kind, dy) : console.warn('ps: start a run first')),
      /** `ps.landmark('maze')` walks you to the nearest maze (`cottage`, `tunnel`, `ruins`, `camp`; any without an argument), 60 px south of it. */
      landmark: (id?: LandmarkId, dy?: number) => (run ? devLandmark(run.game, id, dy) : console.warn('ps: start a run first')),
      weather: (id: WeatherId) => withRun((g) => setWeather(g, id)),
      /** `ps.ball(3)` drops Poké Balls 20 px to the right of the player (inside the magnet), side by side. */
      ball: (n = 1) => withRun((g) => Array.from({ length: n }, (_, i) => dropPickup(g, localPlayer(g).x + 20 + i * 6, localPlayer(g).y, 'pokeball'))),
      ...riftDevTools(() => run?.game),
      ...placeDevTools(() => run?.game),
      ...levelUpDevTools(() => run?.game),
      ...kitDevTools(() => run?.game),
      ...eggMoveDevTools(() => run?.game),
      ...learnDevTools(() => run?.game),
      ...tmDevTools(() => run?.game),
      ...evoGateDevTools(() => run?.game),
      ...duoDevTools(() => run?.game),
      ...tensionDevTools(() => run?.game),
      ...hazardDevTools(() => run?.game),
      // A Legend-mode run leaves the save's partner as it was.
      ...legendDevTools(() => run?.game, (id) => {
        const partner = loadSave().partner
        void startRun(id)
        updateSave((s) => ({ ...s, partner }))
      }),
      ...captureDevTools(ui, () => Boolean(run?.game.endless)),
      ...spitterDevTools(() => run?.game, (dex) => void loadSpecies(dex).catch(() => {})),
      // Rebuilds the missions screen or the title so changes show up right away.
      ...missionDevTools(() => (screen?.el.classList.contains('title-home') ? showTitle() : screen?.el.querySelector('.missions') ? showMissions() : undefined)),
      ...devEggs,
      ...devGifts,
      ...martDevTools(() => {
        // A new outbreak plays from the next run's plan, and the title, the Mart or the select shows it.
        upcoming = planRun()
        if (ui.querySelector('.shop-sheet')) showTitle({ shop: 'shop', instant: true })
        else if (screen?.el.classList.contains('title-home')) showTitle()
        else if (screen?.el.classList.contains('partner-screen')) showMenu()
      }),
    },
  })
}
