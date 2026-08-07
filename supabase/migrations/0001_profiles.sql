-- 0001_profiles.sql
-- One row per auth user. Created automatically on signup by the trigger in
-- 0004_companion.sql (which also provisions the companion).

-- Shared helper to keep updated_at in sync.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  -- IANA timezone name; rendering always uses this, storage is always UTC.
  timezone text not null default 'UTC',
  -- ISO 4217 code; amounts are stored as integer minor units (cents, paise, …).
  preferred_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User settings: timezone, currency. One row per auth user.';

alter table public.profiles enable row level security;

create policy "profiles are readable by the owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are insertable by the owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles are updatable by the owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
