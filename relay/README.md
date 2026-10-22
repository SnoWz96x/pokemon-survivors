# Co-op relay

The room relay for co-op: a Cloudflare Worker with one Durable Object per room
(`idFromName(code)`, SQLite storage). It owns the run's clock (60 Hz, ticks
derived from elapsed time), stamps inputs into the next unsent tick, broadcasts
frames without waiting on storage, writes the input log once a second,
compares the players' state hashes, keeps the latest snapshot a majority agreed
on, heals a diverged client and records a desync dump. It runs no game code: it
imports only `../src/net/protocol.ts`, which imports nothing (a test checks it).

Storage comes two ways (the doc block atop `src/room.ts`). Rare state (seats,
run start and end, the agreed snapshot, pauses) is a durable room save: the
output gate holds every message until it commits. The input log, decided
hashes, clock bound and snapshot chunks are written with `allowUnconfirmed`
(KV keys; `sql.exec` always takes the gate), so frames and pongs never wait on
a commit. A crash can lose the newest second of log: the clock bound, written
3 s ahead with every batch (never under 2 s, so a lost batch is covered while
its commit takes under 2 s; the worst measured took 1.1 s), keeps the
restarted room from sending a tick twice, the clients resume from their own
state, and the hash check heals anyone who rebuilt without it. The cost: after
a restart the clock resumes at the bound, so the players get 2 to 3 s of ticks
without their input.

- `src/room.ts`: the room as a pure state machine (all the rules, tested in `test/room.test.ts`).
- `src/roomObject.ts`: the Durable Object, a thin shell doing the storage, sockets and timers the room asks for.
- `src/vault.ts`: one Durable Object keeping desync dumps after their room is gone (30 days, the newest 500, pruned by its alarm), and the lab's kept runs (below).
- `src/telemetry.ts`: what makes every run diagnosable (below), kept out of the room's rules.
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

## Telemetry

JSON lines in Workers Logs (observability is on), one per event:

- `do.boot`: a room's object started (`colo` and `loc` where it runs, from Cloudflare's trace asked once per isolate; the run and tick it resumes at).
- `conn.open` / `conn.close`: a socket, with where it meets Cloudflare (`colo`, `country`, `asn`, `rtt`: the edge's TCP round trip, set by the Worker in `X-PS-Edge`), and at close its code or the relay's reason and how long it lived.
- `run.summary`: at a run's end or when its room goes (`why`, `final`), and also when everyone left it (`why: 'left'`, `final: false`: an idle room's object is usually evicted before it expires, and its counts with it): frames sent and those carrying more than a tick, the frame timer's lateness (p50, p99, max ms), messages in by kind, stick inputs coalesced and messages dropped, bytes per seat, storage writes by kind, snapshot sizes, pauses, and per seat its edge, how many times it joined, and its own link report (`net`: round trip, hold, underruns, stalls, reconnects, sent every 15 s).

`welcome` also says where the room runs (`net`: `colo`, `region`, the socket's `edge` and `edgeRtt`), for the client's own `coop_net` event.

**Kept runs.** A run that lasted a minute or more is offered to the vault when it is summed up (above): its input log, as a dump (`kind: 'run'`, `meta.why`, `meta.net` per seat, `score`; one id per run, so an offer made when everyone left is replaced if the run goes on), so a laggy run can be replayed in the lab. At most 20 a UTC day, the laggiest win (`score`: the worst seat's round trip p95, plus 20 per underrun and 50 per reconnect), kept 14 days. `/admin/dumps` lists them with the rest (`kind`, `score`).

## Limits and costs

Storage writes per run: one log batch a second (the ticks with inputs, the hashes
decided and the clock bound), the snapshot chunks every 10 s (and the old ones'
deletes), and a room save for each rare change. A 20-minute run writes a couple of
thousand rows (it was about 75k with a row per input tick). The Workers Free plan
allows 100k rows written a day.
