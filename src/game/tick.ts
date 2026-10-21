/** The fixed simulation step (60 Hz), the same in the shell, replays (`replay.ts`) and co-op's lockstep. A leaf module, so game code can import it without pulling `replay.ts` in. */
export const TICK = 1 / 60
