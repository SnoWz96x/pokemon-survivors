# Co-op relay

The room relay for co-op: a Cloudflare Worker with one Durable Object per room
(`idFromName(code)`, SQLite storage). It owns the run's clock (60 Hz, ticks
derived from elapsed time), stamps inputs into the next unsent tick, broadcasts
frames without waiting on storage, writes the input log once a second,
compares the players' state hashes, keeps the latest snapshot a majority agreed
on, heals a diverged client and records a desync dump.

Storage comes two ways (the doc block atop `src/room.ts`). Rare state (seats,
run start and end, the agreed snapshot, pauses) is a durable room save: the
output gate holds every message until it commits. The input log, decided
hashes, clock bound and snapshot chunks are written with `allowUnconfirmed`
(KV keys; `sql.exec` always takes the gate), so frames and pongs never wait on
a commit. A crash can lose the newest second of log: the clock bound, written
10 s ahead, keeps the restarted room from sending a tick twice, the clients
resume from their own state, and the hash check heals anyone who rebuilt
without it. The cost: after a restart the clock resumes at the bound, so the
players get 5 to 10 s of ticks without their input. It runs
no game code: it imports only `../src/net/protocol.ts`, which imports nothing
(a test checks it).

- `src/room.ts`: the room as a pure state machine (all the rules, tested in `test/room.test.ts`).
- `src/roomObject.ts`: the Durable Object, a thin shell doing the storage, sockets and timers the room asks for.
- `src/vault.ts`: one Durable Object keeping desync dumps after their room is gone (30 days, the newest 500, pruned by its alarm).
- `src/index.ts`: the Worker routes; `src/auth.ts`: Clerk session tokens (RS256 against the JWKS).

```bash
npm install
npm test             # vitest in the Workers runtime (pure rules + a restart test)
npm run typecheck    # wrangler types + tsc
npm run dev          # wrangler dev on :8791
npm run deploy       # ps-coop-dev on workers.dev (also allows Vercel previews)
npm run deploy:prod  # ps-coop on workers.dev (only pokemonsurvivors.com)
node scripts/probe.mjs --bots 3 --secs 40 --desync --rejoin   # bots against a deployed relay
```

## Endpoints

- `POST /rooms` `{ v, build, region? }` → `{ code, region }`. The room lives near the host
  (location hint from the request's continent, or `region`).
- `GET /rooms/<code>/ws`: the WebSocket. The first message is `hello`. Co-op is for signed-in
  players (a Clerk session token in `hello.auth`): a guest hello is refused with `signIn`, except
  where `ALLOW_GUESTS` is `on` (the dev relay and local `wrangler dev`, for the soak, the in-tab
  bots and dev builds; `env.production` has it `off`).
- `GET /health`: the Worker answering (no Durable Object is touched).
- `GET /admin/dumps` (the last 100) and `GET /admin/dumps/<id>` (gzipped JSON), with
  `Authorization: Bearer <ADMIN_TOKEN>`. Without the token they answer 404.

## Secrets

`ADMIN_TOKEN` is set with `wrangler secret put ADMIN_TOKEN` (add `--env production` for
`ps-coop`). The tokens are in `~/.config/ps-coop/dev-admin-token` and `prod-admin-token` on
Pedro's Mac (mode 600). To fetch a dump:

```bash
H="Authorization: Bearer $(cat ~/.config/ps-coop/dev-admin-token)"
curl -s -H "$H" https://ps-coop-dev.pedrobarretto.workers.dev/admin/dumps
curl -s -H "$H" https://ps-coop-dev.pedrobarretto.workers.dev/admin/dumps/<id> | gunzip > dump.json
```

A dump has `meta` (room, build, region, the run's start with seed and loadouts, the
hashes reported at the diverged tick, seats with builds and user agents), `log`
(`[tick, entries]` for every tick with inputs) and `hashes` (`[tick, {seat: hash}]`).
Re-simulating `meta.run` with `log` reproduces the run.

## Limits and costs

Storage writes per run: one log batch a second (the ticks with inputs, the hashes
decided and the clock bound), the snapshot chunks every 10 s (and the old ones'
deletes), and a room save for each rare change. A 20-minute run writes a couple of
thousand rows (it was about 75k with a row per input tick). The Workers Free plan
allows 100k rows written a day.
