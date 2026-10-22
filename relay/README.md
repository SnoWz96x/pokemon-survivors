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

- `do.boot`: a room's object started (`colo`: where it runs, from Cloudflare's trace asked once per isolate; the run and tick it resumes at).
- `conn.open` / `conn.close`: a socket, with where it meets Cloudflare (`colo`, `country`, `asn`, `rtt`: the edge's TCP round trip, set by the Worker in `X-PS-Edge`), and at close its code or the relay's reason and how long it lived.
- `run.summary`: at a run's end or when its room goes (`why`, `final`), and also when everyone left it (`why: 'left'`, `final: false`: an idle room's object is usually evicted before it expires, and its counts with it): frames sent and those carrying more than a tick, the frame timer's lateness (p50, p99, max ms), messages in by kind (a `batch` once, and each message it carries by its own kind), stick inputs coalesced and messages dropped, bytes per seat, storage writes by kind (log batches, room saves, snapshot chunks, deletes), snapshot sizes, pauses, and per seat its edge, how many times it joined, and its own link report (`net`: round trip, hold, underruns, stalls, reconnects, sent every 15 s).

`welcome` also says where the room runs (`net`: `colo`, `region`, the socket's `edge` and `edgeRtt`), for the client's own `coop_net` event.

**Kept runs.** A run that lasted a minute or more is offered to the vault when it is summed up (above): its input log, as a dump (`kind: 'run'`, `meta.why`, `meta.net` per seat, `score`; one id per run, so an offer made when everyone left is replaced if the run goes on), so a laggy run can be replayed in the lab. At most 20 a UTC day, the laggiest win (`score`: the worst seat's round trip p95, plus 20 per underrun and 50 per reconnect), kept 14 days. `/admin/dumps` lists them with the rest (`kind`, `score`).

## São Paulo relay (`node/`)

Cloudflare has no Durable Objects in South America, so a Brazilian room runs in the US
(116–140 ms away). `node/` runs the same room (`src/room.ts`, `src/store.ts`, `src/auth.ts`,
`src/codes.ts`) on Node 24 in São Paulo (AWS sa-east-1), for rooms whose host is in South America.
A room's code says its relay (`RELAY_HOMES` in the protocol): Cloudflare makes codes starting
with a letter, São Paulo with a digit. The game (`src/coop/relays.ts`) creates on São Paulo
when it answers within 70 ms and falls back to Cloudflare; without `VITE_COOP_URL_SA` every
room is Cloudflare's.

- One process, every room: one SQLite file per room (`node:sqlite`, WAL), a 60 Hz timer per
  running room, the Worker's routes, origin checks, Clerk tokens, rate limits, the dump vault.
- A deploy or a crash loses only sockets: SIGTERM closes them with 1012 (clients reconnect at
  once and resume), and rooms load back from disk. A room whose step throws starts over from
  its file without touching the others.
- One `t4g.micro` behind CloudFront (TLS and a `wss://<id>.cloudfront.net` address, no domain;
  only CloudFront reaches the instance). systemd restarts it, a timer restarts it when
  `/health` hangs, EC2 alarms recover or reboot the machine, logs go to CloudWatch
  (`/ps-relay/<stage>`, the same JSON lines as the Workers logs, plus `relay.stats` a minute).

```bash
cd node && npm ci
npm test && npm run typecheck   # the Node shell (a restart test included)
npm run typecheck:sst           # sst.config.ts (`sst install` needs no AWS account)
npm run dev                     # :8795, guests on; the game: ps.coop('sa', 'http://localhost:8795')
node ../scripts/probe.mjs --url http://localhost:8795 --bots 3 --secs 40 --desync --rejoin
```

### One-time setup (Pedro)

Never use the client profiles on this Mac: the relay goes in a personal account.

1. Make the personal AWS account and a profile for it (`aws configure sso --profile ps-personal`,
   region `sa-east-1`). Check it: `aws sts get-caller-identity --profile ps-personal` shows the
   personal account. A budget alert at US$ 25 in Billing is a good idea.
2. `cd relay/node && npm ci && npx sst install`.
3. The admin token (for `/admin/dumps`):
   `openssl rand -base64 32 > ~/.config/ps-coop/sa-admin-token && chmod 600 ~/.config/ps-coop/sa-admin-token`, then
   `AWS_PROFILE=ps-personal npx sst secret set AdminToken "$(cat ~/.config/ps-coop/sa-admin-token)" --stage production`.
4. Deploy: `AWS_PROFILE=ps-personal npx sst deploy --stage production`. The first one bootstraps
   SST's state in the account and waits for CloudFront (10–15 min); it prints `url`. Every deploy
   ends only when the instance answers `/health` with the new bundle's `version`.
5. Ship the Cloudflare relay's code change (`npm run deploy:prod` here: its codes now always start
   with a letter) and wait 6 h, a room's longest life, so no live Cloudflare room has a digit code.
6. Vercel: `VITE_COOP_URL_SA=<url>` in Production (and Preview, pointing at a `--stage dev` deploy
   if wanted: that stage seats guests and takes `*.vercel.app`), then redeploy the site.

No DNS record, certificate or Clerk change is needed.

### Running it

```bash
export AWS_PROFILE=ps-personal
npx sst deploy --stage production                       # a new bundle: ~1 s of reconnect for live rooms
aws logs tail /ps-relay/production --follow             # JSON lines
aws ssm start-session --target <instance>               # a shell (no SSH)
curl -s -H "Authorization: Bearer $(cat ~/.config/ps-coop/sa-admin-token)" <url>/admin/dumps
```

Rollback: deploy the older commit, or on the instance `ln -sfn /opt/ps-relay/relay-<old>.mjs
/opt/ps-relay/relay.mjs && systemctl restart ps-relay` (the last 5 bundles stay).

Costs a month in sa-east-1: the instance US$ 9.78, its public IPv4 US$ 3.65, 8 GB gp3 ~US$ 1.20,
logs and alarms under US$ 1, CloudFront within its free tier (1 TB, 10M requests): **~US$ 16**.
A 4-player room takes ~1.5% of a core; past ~8 busy rooms at once the burstable CPU spends credits
(unlimited mode bills the surplus), and `t4g.small` (US$ 19.56) doubles the baseline.

## Limits and costs

Storage writes per run: one log batch a second (the ticks with inputs, the hashes
decided and the clock bound), the snapshot chunks every 10 s (and the old ones'
deletes), and a room save for each rare change. A 20-minute run writes a couple of
thousand rows (it was about 75k with a row per input tick). The Workers Free plan
allows 100k rows written a day.
