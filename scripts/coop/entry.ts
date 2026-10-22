// What the soak's bot workers run, bundled by `soak.mjs` (the same client code as the browser).
export { createBot, botPick } from '../../src/coop/bot'
export { bank, bankKey, loadBanked } from '../../src/coop/bank'
export { coopOver, coopPayout } from '../../src/game/coop'
export { stateHash } from '../../src/game/snapshot'
export { localPlayer } from '../../src/game/players'
export { webSocket } from '../../src/coop/client'
