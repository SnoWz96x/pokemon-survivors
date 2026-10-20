/**
 * Co-op numbers (`game/coop.ts`). A team of `n` active players (not away, not
 * gone) faces a denser, tougher horde and tougher bosses; every Exp. Candy
 * reaches the whole team (split so levels keep a solo pace) and ₽ are worth a
 * bit more, since the team's total is split at the end. Scalings read
 * 1 + per·(n − 1), so a team of one plays like solo. Tuned with headless bot
 * runs (see the PR that brought them).
 */
export const COOP = {
  /** Players in a run, at most. */
  maxPlayers: 4,
  /** Px between teammates at the start. */
  spacing: 34,
  /**
   * The world's view for the simulation (spawn ring, despawns, what's on a
   * screen): every client must simulate the same, whatever its window; the
   * shell draws its own camera.
   */
  view: { w: 480, h: 270 },
  scale: {
    /** Regular spawn rate. */
    spawn: 0.6,
    /** Regular horde cap. */
    cap: 0.45,
    /** Regular enemy HP. */
    hp: 0.25,
    /** Boss, Alpha, rift legendary and Arceus HP: everyone hits it at once. */
    bossHp: 0.85,
    /** Exp. Candy reaching each player is divided by this. */
    xp: 0.55,
    /** ₽ collected (the team's total is divided by the players at the end). */
    coins: 0.3,
  },
  revive: {
    /** Seconds a teammate must stand next to a fainted player. */
    time: 3,
    /** How close (px, body to Poké Ball) counts as next to them. */
    radius: 26,
    /** Share of max HP they get back up with. */
    hp: 0.4,
    /** Seconds of invulnerability after getting up (and after coming back from away). */
    iframes: 2,
    /** Progress lost per second while nobody stands there. */
    decay: 1.5,
  },
  pick: {
    /** Seconds a player's pick screen waits before it picks for them. */
    time: 15,
    /** A pick that opens another screen (a fork's branches, the next level-up) gives at least this long for it. */
    next: 8,
    /** Screens picked for a player in one go before giving up (a guard: every pick ends in a few). */
    chain: 64,
  },
  /** Seconds the endless vote stays open on the victory screen. */
  voteTime: 20,
} as const
