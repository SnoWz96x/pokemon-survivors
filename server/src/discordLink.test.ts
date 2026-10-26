import { describe, expect, it } from 'vitest'
import { discordAccount, SUPPORTER_ROLES, supporterRoleChanges, type ExternalAccountInfo } from './discordLink'

describe('supporterRoleChanges', () => {
  const { supporter, gold, diamond } = SUPPORTER_ROLES

  it("gives the tier's role in place of the others", () => {
    expect(supporterRoleChanges('supporter')).toEqual({ add: [supporter], remove: [gold, diamond] })
    expect(supporterRoleChanges('gold')).toEqual({ add: [gold], remove: [supporter, diamond] })
    expect(supporterRoleChanges('diamond')).toEqual({ add: [diamond], remove: [supporter, gold] })
  })

  it('takes every supporter role back once the tier is gone (a pledge that ended)', () => {
    expect(supporterRoleChanges(null)).toEqual({ add: [], remove: [supporter, gold, diamond] })
  })
})

describe('discordAccount', () => {
  const account = (over: Partial<ExternalAccountInfo>): ExternalAccountInfo => ({
    provider: 'discord',
    providerUserId: '123',
    username: 'ash',
    verification: { status: 'verified' },
    ...over,
  })

  it('finds the verified Discord account, whichever way Clerk names the provider', () => {
    expect(discordAccount([account({ provider: 'google', providerUserId: '9' }), account({})])).toEqual({ id: '123', username: 'ash' })
    expect(discordAccount([account({ provider: 'oauth_discord' })])).toEqual({ id: '123', username: 'ash' })
  })

  it('keeps one Clerk connected without reading its profile (Discord tells who it is)', () => {
    expect(discordAccount([account({ providerUserId: '', username: null })])).toEqual({ id: '', username: '' })
  })

  it('ignores one whose connection never finished', () => {
    expect(discordAccount([account({ verification: { status: 'unverified' } })])).toBeNull()
    expect(discordAccount([account({ verification: null })])).toBeNull()
  })

  it('is null without one', () => {
    expect(discordAccount([account({ provider: 'google' })])).toBeNull()
  })
})
