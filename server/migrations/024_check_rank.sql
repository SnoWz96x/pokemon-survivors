-- The re-simulation's order (server/src/checks.ts, `checkRank` in server/src/checkRank.ts). As a ranked run reports, the API keeps
-- its replay only when the run is on show (0 for a challenge's official attempt, else its best place within the margin of a board
-- it's on) or drawn for the determinism sample (`CHECKED.sampleRank`), and stores that here; any other run's replay is dropped then
-- and there, and this stays null (as on every run from before). Only adds, so the previous API keeps working during a rollout;
-- a new column of `runs` keeps the table's RLS, and `anon`/`authenticated` still have no grants on it.
alter table runs add column check_rank smallint;

-- When the last sample was kept (`max(finished_at) where check_rank = sampleRank`).
create index runs_check_rank on runs (check_rank, finished_at) where check_rank is not null;

-- The runs waiting for their check, in the order the checks take them.
create index runs_check_queue on runs (check_rank, finished_at) where verified is null and replay is not null;
