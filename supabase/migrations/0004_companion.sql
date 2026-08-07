-- 0004_companion.sql
-- Companion state and the append-only XP ledger, plus the signup trigger that
-- provisions each new user's profile and companion.

-- Stage thresholds (documented here so client, tests, and edge functions agree).
--   hatchling: 0 XP     "We're starting together."
--   growing:   250 XP   "My routines are taking shape."
--   thriving:  750 XP   "I've built momentum."

create table public.companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  species text not null default 'creature',
  name text,
  stage text not null default 'hatchling'
    check (stage in ('hatchling', 'growing', 'thriving')),
  xp bigint not null default 0 check (xp >= 0),
  quiet_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.companions is 'The user''s companion: species, stage, XP, and reward preferences. Never decreases XP or punishes missed tasks.';

alter table public.companions enable row level security;

create policy "companions are readable by the owner"
  on public.companions for select
  using (auth.uid() = user_id);

create policy "companions are insertable by the owner"
  on public.companions for insert
  with check (auth.uid() = user_id);

create policy "companions are updatable by the owner"
  on public.companions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "companions are deletable by the owner"
  on public.companions for delete
  using (auth.uid() = user_id);

create trigger companions_set_updated_at
  before update on public.companions
  for each row execute function public.set_updated_at();

-- XP and stage are derived server-side from the xp_events ledger. A plain
-- client (authenticated role) may edit cosmetic fields (name, quiet_mode) but
-- must never bump its own XP or stage; only the service role (Edge Function)
-- may. The update RLS policy above still gates row ownership.
create or replace function public.guard_companion_xp()
returns trigger
language plpgsql
as $$
begin
  if (
    new.xp is distinct from old.xp or new.stage is distinct from old.stage
  ) and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'XP and stage are managed server-side and cannot be changed directly';
  end if;
  return new;
end;
$$;

create trigger companions_guard_xp
  before update on public.companions
  for each row execute function public.guard_companion_xp();

create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null,
  amount integer not null check (amount > 0),
  -- Idempotency key such as 'task:{task_id}:completion:{occurrence_id}'.
  -- The unique(user_id, idempotency_key) constraint makes duplicate reward
  -- writes (retries, reconnects) impossible at the storage layer.
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

comment on table public.xp_events is 'Append-only reward ledger. XP totals derive from this; writes must be idempotent.';

alter table public.xp_events enable row level security;

-- The ledger is read-only for the owner. XP is only ever written by the
-- server-side award path (Edge Function with the service role key), so there
-- is no legitimate client insert/update/delete. Keeping write access off the
-- table is what actually prevents XP farming.
create policy "xp_events are readable by the owner"
  on public.xp_events for select
  using (auth.uid() = user_id);

create index xp_events_user_created_idx on public.xp_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Signup provisioning: create the profile AND the companion in one go.
-- Runs with security definer so the trigger can write on behalf of the new user
-- before they are authenticated. search_path is pinned to avoid hijacking.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.companions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
