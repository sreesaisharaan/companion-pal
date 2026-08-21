-- 0011_clerk_user_ids.sql
-- Authentication moved from Supabase Auth to Clerk. Clerk user ids are opaque
-- strings ("user_2abc…"), not UUIDs, so every user-keyed column becomes text.
--
-- RLS policies are recreated to compare `auth.jwt()->>'sub' = user_id`.
-- Supabase's auth.uid() casts the JWT `sub` claim to uuid, which errors on
-- Clerk ids — the owner check must read the string claim directly (the Clerk
-- Supabase integration keeps `sub` as the Clerk user id).
--
-- The FK from profiles → auth.users is dropped (Clerk users never get an
-- auth.users row). The cascade FKs from the user tables → profiles are dropped
-- only to permit the column-type change, then re-added, so deleting a profile
-- row still removes everything the user owns.
--
-- Foreign keys AND RLS policies block column-type changes, so both are dropped
-- up front and the policies are re-created below. All drops use `if exists` so
-- the migration is safe to re-run after a failed attempt (the dashboard SQL
-- editor autocommits each statement, so a mid-file error can leave the earlier
-- drops applied).

-- ── Drop every FK + RLS policy touching id/user_id ────────────────────────
-- Postgres refuses to change the type of a column that a foreign key
-- references or that a policy definition uses, so ALL of them are dropped
-- before any type change and re-created afterwards. `if exists` keeps the
-- migration re-runnable if an earlier attempt failed part-way.

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.task_lists drop constraint if exists task_lists_user_id_fkey;
alter table public.tasks drop constraint if exists tasks_user_id_fkey;
alter table public.task_occurrences drop constraint if exists task_occurrences_user_id_fkey;
alter table public.reminders drop constraint if exists reminders_user_id_fkey;
alter table public.budget_categories drop constraint if exists budget_categories_user_id_fkey;
alter table public.transactions drop constraint if exists transactions_user_id_fkey;
alter table public.monthly_budgets drop constraint if exists monthly_budgets_user_id_fkey;
alter table public.companions drop constraint if exists companions_user_id_fkey;
alter table public.xp_events drop constraint if exists xp_events_user_id_fkey;

drop policy if exists "profiles are readable by the owner" on public.profiles;
drop policy if exists "profiles are insertable by the owner" on public.profiles;
drop policy if exists "profiles are updatable by the owner" on public.profiles;

drop policy if exists "task_lists are readable by the owner" on public.task_lists;
drop policy if exists "task_lists are insertable by the owner" on public.task_lists;
drop policy if exists "task_lists are updatable by the owner" on public.task_lists;
drop policy if exists "task_lists are deletable by the owner" on public.task_lists;

drop policy if exists "tasks are readable by the owner" on public.tasks;
drop policy if exists "tasks are insertable by the owner" on public.tasks;
drop policy if exists "tasks are updatable by the owner" on public.tasks;
drop policy if exists "tasks are deletable by the owner" on public.tasks;

drop policy if exists "task_occurrences are readable by the owner" on public.task_occurrences;
drop policy if exists "task_occurrences are insertable by the owner" on public.task_occurrences;
drop policy if exists "task_occurrences are updatable by the owner" on public.task_occurrences;
drop policy if exists "task_occurrences are deletable by the owner" on public.task_occurrences;

drop policy if exists "reminders are readable by the owner" on public.reminders;
drop policy if exists "reminders are insertable by the owner" on public.reminders;
drop policy if exists "reminders are updatable by the owner" on public.reminders;
drop policy if exists "reminders are deletable by the owner" on public.reminders;

drop policy if exists "budget_categories are readable by the owner" on public.budget_categories;
drop policy if exists "budget_categories are insertable by the owner" on public.budget_categories;
drop policy if exists "budget_categories are updatable by the owner" on public.budget_categories;
drop policy if exists "budget_categories are deletable by the owner" on public.budget_categories;

drop policy if exists "transactions are readable by the owner" on public.transactions;
drop policy if exists "transactions are insertable by the owner" on public.transactions;
drop policy if exists "transactions are updatable by the owner" on public.transactions;
drop policy if exists "transactions are deletable by the owner" on public.transactions;

drop policy if exists "monthly_budgets are readable by the owner" on public.monthly_budgets;
drop policy if exists "monthly_budgets are insertable by the owner" on public.monthly_budgets;
drop policy if exists "monthly_budgets are updatable by the owner" on public.monthly_budgets;
drop policy if exists "monthly_budgets are deletable by the owner" on public.monthly_budgets;

drop policy if exists "companions are readable by the owner" on public.companions;
drop policy if exists "companions are insertable by the owner" on public.companions;
drop policy if exists "companions are updatable by the owner" on public.companions;
drop policy if exists "companions are deletable by the owner" on public.companions;

drop policy if exists "xp_events are readable by the owner" on public.xp_events;

-- ── Switch the id/user_id columns to text ────────────────────────────────
alter table public.profiles alter column id type text;

alter table public.task_lists alter column user_id type text;
alter table public.tasks alter column user_id type text;
alter table public.task_occurrences alter column user_id type text;
alter table public.reminders alter column user_id type text;

alter table public.budget_categories alter column user_id type text;
alter table public.transactions alter column user_id type text;
alter table public.monthly_budgets alter column user_id type text;

alter table public.companions alter column user_id type text;
alter table public.xp_events alter column user_id type text;

-- ── Restore the cascade FKs (dropped above only to change the column type) ─
alter table public.task_lists
  add constraint task_lists_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.tasks
  add constraint tasks_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.task_occurrences
  add constraint task_occurrences_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.reminders
  add constraint reminders_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.budget_categories
  add constraint budget_categories_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.transactions
  add constraint transactions_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.monthly_budgets
  add constraint monthly_budgets_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.companions
  add constraint companions_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.xp_events
  add constraint xp_events_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ── RLS: owner checks now read the Clerk sub claim ────────────────────────
-- auth.uid() throws on non-UUID subs, so every policy swaps to
-- auth.jwt()->>'sub' (text) against the now-text id/user_id columns.
-- (The policies were dropped above, before the type changes.)

-- profiles (0001)
create policy "profiles are readable by the owner"
  on public.profiles for select
  using (auth.jwt()->>'sub' = id);

create policy "profiles are insertable by the owner"
  on public.profiles for insert
  with check (auth.jwt()->>'sub' = id);

create policy "profiles are updatable by the owner"
  on public.profiles for update
  using (auth.jwt()->>'sub' = id)
  with check (auth.jwt()->>'sub' = id);

-- task_lists (0002)
create policy "task_lists are readable by the owner"
  on public.task_lists for select
  using (auth.jwt()->>'sub' = user_id);

create policy "task_lists are insertable by the owner"
  on public.task_lists for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "task_lists are updatable by the owner"
  on public.task_lists for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "task_lists are deletable by the owner"
  on public.task_lists for delete
  using (auth.jwt()->>'sub' = user_id);

-- tasks (0002)
create policy "tasks are readable by the owner"
  on public.tasks for select
  using (auth.jwt()->>'sub' = user_id);

create policy "tasks are insertable by the owner"
  on public.tasks for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "tasks are updatable by the owner"
  on public.tasks for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "tasks are deletable by the owner"
  on public.tasks for delete
  using (auth.jwt()->>'sub' = user_id);

-- task_occurrences (0002)
create policy "task_occurrences are readable by the owner"
  on public.task_occurrences for select
  using (auth.jwt()->>'sub' = user_id);

create policy "task_occurrences are insertable by the owner"
  on public.task_occurrences for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "task_occurrences are updatable by the owner"
  on public.task_occurrences for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "task_occurrences are deletable by the owner"
  on public.task_occurrences for delete
  using (auth.jwt()->>'sub' = user_id);

-- reminders (0002)
create policy "reminders are readable by the owner"
  on public.reminders for select
  using (auth.jwt()->>'sub' = user_id);

create policy "reminders are insertable by the owner"
  on public.reminders for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "reminders are updatable by the owner"
  on public.reminders for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "reminders are deletable by the owner"
  on public.reminders for delete
  using (auth.jwt()->>'sub' = user_id);

-- budget_categories (0003)
create policy "budget_categories are readable by the owner"
  on public.budget_categories for select
  using (auth.jwt()->>'sub' = user_id);

create policy "budget_categories are insertable by the owner"
  on public.budget_categories for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "budget_categories are updatable by the owner"
  on public.budget_categories for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "budget_categories are deletable by the owner"
  on public.budget_categories for delete
  using (auth.jwt()->>'sub' = user_id);

-- transactions (0003)
create policy "transactions are readable by the owner"
  on public.transactions for select
  using (auth.jwt()->>'sub' = user_id);

create policy "transactions are insertable by the owner"
  on public.transactions for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "transactions are updatable by the owner"
  on public.transactions for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "transactions are deletable by the owner"
  on public.transactions for delete
  using (auth.jwt()->>'sub' = user_id);

-- monthly_budgets (0003)
create policy "monthly_budgets are readable by the owner"
  on public.monthly_budgets for select
  using (auth.jwt()->>'sub' = user_id);

create policy "monthly_budgets are insertable by the owner"
  on public.monthly_budgets for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "monthly_budgets are updatable by the owner"
  on public.monthly_budgets for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "monthly_budgets are deletable by the owner"
  on public.monthly_budgets for delete
  using (auth.jwt()->>'sub' = user_id);

-- companions (0004)
create policy "companions are readable by the owner"
  on public.companions for select
  using (auth.jwt()->>'sub' = user_id);

create policy "companions are insertable by the owner"
  on public.companions for insert
  with check (auth.jwt()->>'sub' = user_id);

create policy "companions are updatable by the owner"
  on public.companions for update
  using (auth.jwt()->>'sub' = user_id)
  with check (auth.jwt()->>'sub' = user_id);

create policy "companions are deletable by the owner"
  on public.companions for delete
  using (auth.jwt()->>'sub' = user_id);

-- xp_events (0004)
create policy "xp_events are readable by the owner"
  on public.xp_events for select
  using (auth.jwt()->>'sub' = user_id);

-- ── XP award RPCs (0007) ──────────────────────────────────────────────────
-- Recreated with text user ids; bodies are otherwise unchanged.

drop function if exists public.award_task_xp(uuid, uuid);

create or replace function public.award_task_xp(p_user_id text, p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_due timestamptz;
  v_task_done timestamptz;
  v_requested integer := 10; -- base: task completed
  v_timezone text;           -- the user's profile timezone (for the daily cap)
  v_today bigint;            -- task XP since the start of the *user's* local day
  v_amount integer;
  v_ledger bigint;
  v_stage text;
  v_previous_stage text;
  v_inserted boolean := false;
  v_capped boolean := false;
begin
  -- Serialise per user: one award at a time.
  select stage into v_previous_stage
  from public.companions
  where user_id = p_user_id
  for update;

  -- The user's local day boundary for the daily cap. UTC midnight would
  -- truncate/shift the budget for users in far-ahead timezones; use their
  -- profile timezone so the 50 XP/day resets at THEIR midnight.
  select timezone into v_timezone
  from public.profiles
  where id = p_user_id;
  if v_timezone is null or v_timezone = '' then
    v_timezone := 'UTC';
  end if;

  select due_at, completed_at into v_task_due, v_task_done
  from public.tasks
  where id = p_task_id and user_id = p_user_id;

  if v_task_done is null then
    if not exists (
      select 1 from public.tasks where id = p_task_id and user_id = p_user_id
    ) then
      -- Nonexistent, or owned by someone else (existence is hidden).
      return jsonb_build_object('error', 'task not found');
    end if;
    return jsonb_build_object('error', 'task is not completed');
  end if;

  -- On-time bonus: completed by the due moment.
  if v_task_due is not null and v_task_done <= v_task_due then
    v_requested := v_requested + 5;
  end if;

  -- Task XP earned since the start of the user's local calendar day (their
  -- profile timezone, computed above). Weekly reviews are a separate budget
  -- and are excluded here.
  select coalesce(sum(amount), 0) into v_today
  from public.xp_events
  where user_id = p_user_id
    and source <> 'weekly_review'
    and created_at >= (date_trunc('day', now() at time zone v_timezone)) at time zone v_timezone;

  v_amount := least(v_requested, greatest(0, 50 - v_today));
  if v_amount > 0 then
    begin
      insert into public.xp_events (user_id, source, amount, idempotency_key)
      values (p_user_id, 'task_completion', v_amount,
              'task:' || p_task_id || ':completion');
      v_inserted := true;
    exception
      when unique_violation then
        v_inserted := false; -- already rewarded
    end;
  else
    v_capped := true;
  end if;

  select coalesce(sum(amount), 0) into v_ledger
  from public.xp_events
  where user_id = p_user_id;

  v_stage := case
    when v_ledger >= 750 then 'thriving'
    when v_ledger >= 250 then 'growing'
    else 'hatchling'
  end;

  update public.companions
  set xp = v_ledger, stage = v_stage
  where user_id = p_user_id;

  return jsonb_build_object(
    'already_awarded', not v_inserted and not v_capped,
    'awarded', case when v_inserted then v_amount else 0 end,
    'xp', v_ledger,
    'stage', v_stage,
    'level_up', v_stage <> v_previous_stage,
    'capped', v_capped
  );
end;
$$;

drop function if exists public.award_weekly_review_xp(uuid, text);

create or replace function public.award_weekly_review_xp(p_user_id text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer := 15;
  v_ledger bigint;
  v_stage text;
  v_previous_stage text;
  v_inserted boolean := false;
begin
  select stage into v_previous_stage
  from public.companions
  where user_id = p_user_id
  for update;

  begin
    insert into public.xp_events (user_id, source, amount, idempotency_key)
    values (p_user_id, 'weekly_review', v_amount, p_idempotency_key);
    v_inserted := true;
  exception
    when unique_violation then
      v_inserted := false; -- already reviewed this ISO week
  end;

  select coalesce(sum(amount), 0) into v_ledger
  from public.xp_events
  where user_id = p_user_id;

  v_stage := case
    when v_ledger >= 750 then 'thriving'
    when v_ledger >= 250 then 'growing'
    else 'hatchling'
  end;

  update public.companions
  set xp = v_ledger, stage = v_stage
  where user_id = p_user_id;

  return jsonb_build_object(
    'already_awarded', not v_inserted,
    'awarded', case when v_inserted then v_amount else 0 end,
    'xp', v_ledger,
    'stage', v_stage,
    'weekly_review_done', true
  );
end;
$$;

-- Only the service role (Edge Function) may award XP.
revoke execute on function public.award_task_xp(text, uuid) from public, anon, authenticated;
grant execute on function public.award_task_xp(text, uuid) to service_role;
revoke execute on function public.award_weekly_review_xp(text, text) from public, anon, authenticated;
grant execute on function public.award_weekly_review_xp(text, text) to service_role;

-- ── Signup provisioning (0004) ────────────────────────────────────────────
-- The old trigger hooked auth.users, which Clerk users never touch. The app
-- now upserts the profile row itself on first login; this trigger provisions
-- the companion when that row is created.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.companions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_user();

-- Backfill: any existing profile without a companion (e.g. a Clerk user who
-- signed in before this migration ran) gets one.
insert into public.companions (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
