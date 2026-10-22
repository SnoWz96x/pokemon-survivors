-- The rules (`RULES_VERSION`) the API played when it dealt a run's token. The next API, a rules version up,
-- still takes that run's replay on these rules within a grace window (server/src/rulesGrace.ts), judged with
-- the frozen simulator it ships (server/sims): a run that straddled a rules deploy isn't lost. The pin is the
-- server's, so a client can't claim old rules on a token dealt under new ones. Null on tokens from before this,
-- which are judged as before (older rules refused). Only adds, so the previous API keeps working during a rollout;
-- a new column of `runs` keeps the table's RLS, and `anon`/`authenticated` still have no grants on it.
alter table runs add column rules integer;
