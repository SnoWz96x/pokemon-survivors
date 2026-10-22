-- Friends, presence and co-op invites (src/friends.ts). Friends are mutual `follows`. Only adds, so the previous API keeps working during a rollout.

-- `/players?q=` searches handles by prefix (`handle like 'ab%'`). The unique
-- index on `handle` only serves that under the C collation; this one always does.
create index users_handle_prefix on users (handle text_pattern_ops);

-- "Appear offline": friends see the player offline, and never their room.
alter table users add column appear_offline boolean not null default false;

-- What each signed-in player is doing, as their last heartbeat (`PUT /presence`) said.
-- `activity`: `lobby`, `room` (a co-op room) or `run`; `room`: the room code, null outside one.
-- A row older than its activity's window (`presenceOnline`) reads as offline; `DELETE /presence` drops it.
create table presence (
  user_id text primary key references users (id) on delete cascade,
  activity text not null check (activity in ('lobby', 'room', 'run')),
  room text,
  seen_at timestamptz not null default now()
);

-- A co-op invite: one per sender and friend (a new one replaces the last), live until `expires_at`
-- unless the friend dismissed it. Shown only while both still follow each other.
create table coop_invites (
  id uuid not null unique default gen_random_uuid(),
  from_id text not null references users (id) on delete cascade,
  to_id text not null references users (id) on delete cascade,
  room text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  dismissed_at timestamptz,
  primary key (from_id, to_id)
);

create index coop_invites_to on coop_invites (to_id, expires_at);
