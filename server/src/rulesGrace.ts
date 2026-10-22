import { RANKED } from '../../src/game/ranking'
import { RULES_VERSION } from '../../src/game/replay'

/**
 * How long after its token was dealt a run on the previous rules may still
 * report: the longest run `RANKED.maxTime` allows (endless mode included),
 * plus two hours for pauses and a result that waited offline in the queue.
 */
export const RULES_GRACE_SECONDS = RANKED.maxTime + 2 * 3600

/** The rules the API pinned on a run's token as it dealt it (null on tokens from before migration 022), and the token's age in seconds. */
export type TokenRules = { rules: number | null; age: number }

/**
 * Whether the API takes a replay of `claimed` rules for the run of `token`
 * (null: no such token of the player's). `same`: its own rules. `grace`: the
 * previous ones, only on a token the previous API dealt (pinned to them) at
 * most `RULES_GRACE_SECONDS` ago, judged with the frozen simulator
 * (`sims.ts`): a run that straddled a rules deploy. `outdated`: anything
 * older (400). `behind`: newer rules than this API's (503, the game sends it
 * again once the API is deployed). The pin is the API's own, so a client that
 * claims old rules on a token dealt under the current ones gets nowhere.
 */
export type RulesVerdict = 'same' | 'grace' | 'outdated' | 'behind'

export const rulesVerdict = (claimed: number, token: TokenRules | null, current: number = RULES_VERSION): RulesVerdict => {
  if (claimed === current) return 'same'
  if (claimed > current) return 'behind'
  return claimed === current - 1 && token?.rules === claimed && token.age <= RULES_GRACE_SECONDS ? 'grace' : 'outdated'
}
