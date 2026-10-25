import { randomFillSync } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import { POLL, POLL_OPTION_IDS, type PollOptionId } from '../../src/data/supporters'
import { donationPoints, newCode, supporterTier, TIER_GIFTS, tiersReached, type SupporterTier } from '../../src/game/supporters'
import type { DonationStatus, HiddenSupporters, Poll, SupporterStatus, WallEntry } from '../../src/game/supporters'
import { parseSaveData } from '../../src/game/meta'
import { hallPokemon } from '../../src/game/trainer'
import type { Sql } from './db'
import { sendGift } from './gifts'
import { patreonAmount, type PaidDonation, type PatreonCharge } from './webhooks'

/** Names on the wall at most. */
const WALL_SIZE = 500

/**
 * Donations and supporters. A paid donation counts for an account once
 * (`credit`): its points join the account's total, and each tier the total
 * reaches sends its thank-you as Mystery Gifts (`TIER_GIFTS`, `key`
 * `support:<tier>:<i>`, so nothing lands twice). A paid donation with no
 * account gets a code instead, which an account redeems later. A Patreon
 * charge of a patron who hasn't linked their Patreon yet gets no code: it
 * waits for them (`donations.patreon_id`) and is credited when they link.
 *
 * `onTierUp` hears of an account whose tier went up, once the transaction
 * committed (the Discord bot updates its role).
 */
export const supporterStore = (sql: Sql, hooks: { onTierUp?: (userId: string) => void } = {}) => {
  /**
   * Credits the donation `id` if it's paid and not credited yet; one with no account just gets its code.
   * The account whose tier went up, if any.
   */
  const credit = async (tx: TransactionSql, id: string): Promise<string | null> => {
    const [d] = await tx<{ provider: string; user_id: string | null; points: number; paid: boolean; credited: boolean; code: string | null }[]>`
      select provider, user_id, points, paid_at is not null as paid, credited_at is not null as credited, code from donations where id = ${id} for update`
    if (!d?.paid || d.credited) return null
    if (!d.user_id) {
      if (!d.code && d.provider !== 'patreon') await tx`update donations set code = ${newCode((b) => randomFillSync(b))} where id = ${id}`
      return null
    }
    const [user] = await tx<{ points: number }[]>`select supporter_points as points from users where id = ${d.user_id} for update`
    const before = user?.points ?? 0
    const after = before + d.points
    await tx`update users set supporter_points = ${after}, supporter_since = coalesce(supporter_since, now()) where id = ${d.user_id}`
    await tx`update donations set credited_at = now() where id = ${id}`
    const reached = tiersReached(before, after)
    for (const tier of reached) {
      for (const [i, content] of TIER_GIFTS[tier].entries()) await sendGift(tx, d.user_id, content, { kind: 'support', tier }, `support:${tier}:${i}`)
    }
    console.log(`donation ${id} credited to ${d.user_id} (${before} → ${after} points)`)
    return reached.length > 0 ? d.user_id : null
  }

  const tierUp = (userId: string | null) => {
    if (userId) hooks.onTierUp?.(userId)
  }

  return {
    /** An AbacatePay checkout about to open: its row, for the account of `handle` when given. False when nobody has that handle. */
    open: async (ref: string, handle: string | null) => {
      const [user] = handle ? await sql<{ id: string }[]>`select id from users where handle = ${handle}` : []
      if (handle && !user) return false
      await sql`insert into donations (provider, ref, handle, user_id) values ('abacatepay', ${ref}, ${handle}, ${user?.id ?? null})`
      return true
    },

    /** A webhook said `d` is paid: records it (once, however often the webhook retries) and credits it. */
    paid: async (d: PaidDonation) => {
      const raised = await sql.begin(async (tx) => {
        const points = donationPoints(d.amount, d.currency)
        const [row] = await tx<{ id: string }[]>`
          insert into donations (provider, ref, handle, user_id, amount, currency, points, paid_at)
          values (${d.provider}, ${d.ref}, ${d.handle}, (select id from users where handle = ${d.handle}), ${d.amount}, ${d.currency.toLowerCase()}, ${points}, now())
          on conflict (ref) do update
          set amount = excluded.amount, currency = excluded.currency, points = excluded.points, paid_at = coalesce(donations.paid_at, excluded.paid_at)
          returning id`
        return row ? await credit(tx, row.id) : null
      })
      tierUp(raised)
    },

    /**
     * A Patreon webhook said a patron's charge is paid: records it once (by
     * its ref, however many events repeat it), for the account that linked
     * the patron or waiting for one, and credits it. A member's charges go one
     * at a time, since each one's amount is what their lifetime total grew
     * past the others (`patreonAmount`); a charge that adds nothing records nothing.
     */
    patreonCharge: async (c: PatreonCharge) => {
      const raised = await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext(${`patreon:${c.member}`}))`
        const [known] = await tx<{ id: string }[]>`select id from donations where ref = ${c.ref}`
        if (known) return null
        const [prior] = await tx<{ cents: number }[]>`
          select coalesce(sum(amount), 0)::int as cents from donations where provider = 'patreon' and ref like ${`patreon:${c.member}:%`}`
        const amount = patreonAmount(c, prior?.cents ?? 0)
        if (amount <= 0) return null
        const [row] = await tx<{ id: string }[]>`
          insert into donations (provider, ref, patreon_id, user_id, amount, currency, points, paid_at)
          values ('patreon', ${c.ref}, ${c.patron}, (select id from users where patreon_id = ${c.patron}), ${amount}, ${c.currency}, ${donationPoints(amount, c.currency)}, now())
          on conflict (ref) do nothing
          returning id`
        return row ? await credit(tx, row.id) : null
      })
      tierUp(raised)
    },

    /**
     * Links the Patreon user `patronId` to `userId` (one game account per
     * Patreon account: whoever links it last keeps it) and credits the
     * patron's charges that were waiting for an account.
     */
    linkPatreon: async (userId: string, patronId: string) => {
      const raised = await sql.begin(async (tx) => {
        await tx`insert into users (id) values (${userId}) on conflict (id) do nothing`
        await tx`update users set patreon_id = null where patreon_id = ${patronId} and id <> ${userId}`
        await tx`update users set patreon_id = ${patronId} where id = ${userId}`
        const waiting = await tx<{ id: string }[]>`
          update donations set user_id = ${userId} where provider = 'patreon' and patreon_id = ${patronId} and user_id is null returning id`
        let up = false
        for (const d of waiting) up = (await credit(tx, d.id)) !== null || up
        if (waiting.length > 0) console.log(`patreon ${patronId} linked to ${userId}: ${waiting.length} waiting charges`)
        return up ? userId : null
      })
      tierUp(raised)
    },

    /** Forgets the player's Patreon: later charges wait for whoever links it next. What it already credited stays. */
    unlinkPatreon: async (userId: string) => {
      await sql`update users set patreon_id = null where id = ${userId}`
    },

    /** What the thank-you page shows for `ref`, or null before any webhook (Stripe's row comes with it). */
    status: async (ref: string): Promise<DonationStatus | null> => {
      const [row] = await sql<{ paid: boolean; handle: string | null; code: string | null; redeemed: boolean }[]>`
        select d.paid_at is not null as paid, u.handle, d.code, d.code is not null and d.user_id is not null as redeemed
        from donations d left join users u on u.id = d.user_id where d.ref = ${ref}`
      if (!row) return null
      // A redeemed code is someone's account now: the page only says it was used.
      return { paid: row.paid, handle: row.redeemed ? null : row.handle, code: row.redeemed ? null : row.code, redeemed: row.redeemed }
    },

    /** Redeems a code for `userId`. `unknown`: no such code; `used`: it went to an account already. */
    redeem: async (userId: string, code: string): Promise<{ ok: true; tier: SupporterTier | null } | { ok: false; error: 'unknown' | 'used' }> => {
      const out = await sql.begin(async (tx) => {
        await tx`insert into users (id) values (${userId}) on conflict (id) do nothing`
        const [d] = await tx<{ id: string; user_id: string | null }[]>`select id, user_id from donations where code = ${code} for update`
        if (!d) return { ok: false, error: 'unknown' } as const
        if (d.user_id) return { ok: false, error: 'used' } as const
        await tx`update donations set user_id = ${userId} where id = ${d.id}`
        const raised = await credit(tx, d.id)
        const [u] = await tx<{ points: number }[]>`select supporter_points as points from users where id = ${userId}`
        return { ok: true, tier: supporterTier(u?.points ?? 0), raised } as const
      })
      if (!out.ok) return out
      tierUp(out.raised)
      return { ok: true, tier: out.tier }
    },

    /** The player's own standing, with their vote in the current poll and whether they linked a Patreon. */
    mine: async (userId: string): Promise<SupporterStatus> => {
      const [row] = await sql<{ points: number; since: Date | null; public: boolean; vote: string | null; patreon: boolean }[]>`
        select supporter_points as points, supporter_since as since, supporter_public as public, patreon_id is not null as patreon,
          (select choice from poll_votes where poll = ${POLL.id} and user_id = ${userId}) as vote
        from users where id = ${userId}`
      const vote = POLL_OPTION_IDS.find((id) => id === row?.vote) ?? null
      return { tier: supporterTier(row?.points ?? 0), since: row?.since?.toISOString() ?? null, public: row?.public ?? true, vote, patreon: row?.patreon ?? false }
    },

    /** Shows or hides the player's badge and name on the wall and the credits. */
    setPublic: async (userId: string, show: boolean) => {
      await sql`update users set supporter_public = ${show} where id = ${userId}`
    },

    /**
     * Supporters who show themselves and have a handle (never a banned one), oldest first, with
     * their title and Pokémon for the Hall da Fama. Only the save fields
     * those read come out of Postgres, never the whole save.
     */
    /** Supporters per tier who stay off the wall (hidden, or without a handle yet): the Hall counts them without naming them. */
    hidden: async (): Promise<HiddenSupporters> => {
      const rows = await sql<{ points: number }[]>`
        select supporter_points as points from users
        where supporter_points > 0 and not (supporter_public and handle is not null)`
      const counts: HiddenSupporters = { supporter: 0, gold: 0 }
      for (const r of rows) {
        const tier = supporterTier(r.points)
        if (tier) counts[tier]++
      }
      return counts
    },

    wall: async (): Promise<WallEntry[]> => {
      const rows = await sql<{ handle: string; name: string | null; points: number; since: Date; save: unknown }[]>`
        select u.handle, u.name, u.supporter_points as points, u.supporter_since as since,
          case when s.user_id is null then null else jsonb_build_object(
            'version', s.data->'version', 'partner', s.data->'partner', 'shinyPicks', s.data->'shinyPicks',
            'companion', s.data->'companion', 'companions', s.data->'companions', 'shinyStarters', s.data->'shinyStarters', 'hatched', s.data->'hatched',
            'title', s.data->'title', 'titles', s.data->'titles', 'style', s.data->'style', 'achievements', jsonb_build_object('unlocked', s.data->'achievements'->'unlocked')
          ) end as save
        from users u left join saves s on s.user_id = u.id
        where u.supporter_points > 0 and u.supporter_public and u.handle is not null and u.banned_at is null
        order by u.supporter_since, u.id limit ${WALL_SIZE}`
      return rows.flatMap((r) => {
        const tier = supporterTier(r.points)
        if (!tier) return []
        // Never synced: no title, and the Hall shows a Poké Ball.
        const save = r.save === null ? null : parseSaveData(r.save)
        return [{ handle: r.handle, name: r.name ?? r.handle, tier, since: r.since.toISOString(), title: save?.title ?? null, pokemon: save ? hallPokemon(save) : null }]
      })
    },

    /** The current poll's votes per option. */
    poll: async (): Promise<Poll> => {
      const rows = await sql<{ choice: string; n: number }[]>`select choice, count(*)::int as n from poll_votes where poll = ${POLL.id} group by choice`
      return { id: POLL.id, votes: Object.fromEntries(POLL_OPTION_IDS.map((id) => [id, rows.find((r) => r.choice === id)?.n ?? 0])) as Record<PollOptionId, number> }
    },

    /** A supporter's vote (replacing their previous one). False when `userId` isn't a supporter. */
    vote: async (userId: string, choice: PollOptionId) => {
      const [row] = await sql<{ id: string }[]>`
        insert into poll_votes (poll, user_id, choice)
        select ${POLL.id}, id, ${choice} from users where id = ${userId} and supporter_points > 0
        on conflict (poll, user_id) do update set choice = excluded.choice, voted_at = now()
        returning user_id as id`
      return row !== undefined
    },
  }
}

export type SupporterStore = ReturnType<typeof supporterStore>
