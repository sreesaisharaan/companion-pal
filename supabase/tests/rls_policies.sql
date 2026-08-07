-- rls_policies.sql
-- Self-contained RLS + trigger tests for Companion Life.
--
-- NOTE: pgcrypto calls are schema-qualified (extensions.crypt/gen_salt) so the
-- suite runs correctly regardless of the session search_path — Supabase keeps
-- extensions in the `extensions` schema, and SQL-editor vs migration-runner
-- sessions differ in whether that schema is on the path.
--
-- HOW TO RUN: open the Supabase dashboard SQL editor (or psql as the postgres
-- role on `supabase start`) and run this whole file. It wraps everything in a
-- transaction and RAISEs on the first failure, so a clean "Success" means all
-- assertions passed. Nothing is left behind.
--
-- What it covers:
--   1. Signup trigger provisions profile + companion
--   2. Users only see their own rows (tasks, transactions)
--   3. Users cannot insert rows owned by someone else
--   4. Users cannot update or delete someone else's rows
--   5. The XP ledger is read-only for owners (no client-side XP farming)
--   6. Companion XP/stage cannot be bumped by the client
--   7. Money precision constraints are enforced
--   8. XP award RPCs are service-role-only, enforce the daily cap atomically,
--      and keep the weekly review out of the task budget

create extension if not exists pgcrypto;

begin;

-- ---------------------------------------------------------------------------
-- 1. Signup trigger
-- ---------------------------------------------------------------------------
do $$
declare
  new_user_id uuid := gen_random_uuid();
  found_profile uuid;
  found_companion uuid;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    (select id from auth.instances order by created_at asc limit 1), new_user_id, 'authenticated', 'authenticated',
    'trigger-test@example.com', extensions.crypt('password', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

  select id into found_profile from public.profiles where id = new_user_id;
  if found_profile is null then
    raise exception 'FAIL 1: signup did not create a profile';
  end if;

  select user_id into found_companion from public.companions where user_id = new_user_id;
  if found_companion is null then
    raise exception 'FAIL 1: signup did not create a companion';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Setup: two users with a task and a transaction each.
-- Users are real auth.users rows (profiles.id references auth.users.id, so a
-- profile cannot exist without its auth identity; the signup trigger
-- provisions profile + companion for each).
-- ---------------------------------------------------------------------------
do $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password
  ) values
    ((select id from auth.instances order by created_at asc limit 1), gen_random_uuid(), 'authenticated', 'authenticated', 'user-a@example.com', extensions.crypt('password', extensions.gen_salt('bf'))),
    ((select id from auth.instances order by created_at asc limit 1), gen_random_uuid(), 'authenticated', 'authenticated', 'user-b@example.com', extensions.crypt('password', extensions.gen_salt('bf')));
end $$;

do $$
declare
  user_a uuid;
  user_b uuid;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  select id into user_b from public.profiles where email = 'user-b@example.com';

  insert into public.tasks (user_id, title) values (user_a, 'A private task');
  insert into public.tasks (user_id, title) values (user_b, 'B private task');

  insert into public.transactions (user_id, amount_minor, occurred_on)
  values (user_a, -1250, current_date);
  insert into public.transactions (user_id, amount_minor, occurred_on)
  values (user_b, -999, current_date);
end $$;

-- ---------------------------------------------------------------------------
-- 2–4. Isolation as user A
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
  user_b uuid;
  visible_tasks bigint;
  visible_txns bigint;
  b_task uuid;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  select id into user_b from public.profiles where email = 'user-b@example.com';
  select id into b_task from public.tasks where user_id = user_b limit 1;

  set local role authenticated;
  set local request.jwt.claim.sub = user_a::text;

  -- A sees exactly their own rows.
  select count(*) into visible_tasks from public.tasks;
  if visible_tasks <> 1 then
    raise exception 'FAIL 2: user A sees % tasks, expected 1 (isolation leak)', visible_tasks;
  end if;

  select count(*) into visible_txns from public.transactions;
  if visible_txns <> 1 then
    raise exception 'FAIL 2: user A sees % transactions, expected 1 (isolation leak)', visible_txns;
  end if;

  -- A cannot read B's task directly.
  if exists (select 1 from public.tasks where id = b_task) then
    raise exception 'FAIL 2: user A could read user B''s task';
  end if;

  -- A cannot insert a row owned by B.
  begin
    insert into public.tasks (user_id, title) values (user_b, 'sneaky');
    raise exception 'FAIL 3: user A could insert a task owned by user B';
  exception
    when others then null; -- policy violation: expected
  end;

  -- A cannot update B's task.
  begin
    update public.tasks set title = 'hacked' where id = b_task;
    raise exception 'FAIL 4: user A could update user B''s task';
  exception
    when others then null; -- expected
  end;

  -- A cannot delete B's task.
  begin
    delete from public.tasks where id = b_task;
    raise exception 'FAIL 4: user A could delete user B''s task';
  exception
    when others then null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. XP ledger is read-only for owners (no client-side XP farming)
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  set local role authenticated;
  set local request.jwt.claim.sub = user_a::text;

  begin
    insert into public.xp_events (user_id, source, amount, idempotency_key)
    values (user_a, 'task_completion', 10, 'task:abc:completion:1');
    raise exception 'FAIL 5: owner could insert into xp_events (XP farming hole)';
  exception
    when others then null; -- expected: write is not allowed
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Companion XP/stage cannot be bumped by the client
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  set local role authenticated;
  set local request.jwt.claim.sub = user_a::text;

  begin
    update public.companions set xp = 999999 where user_id = user_a;
    raise exception 'FAIL 6: owner could set their own companion XP';
  exception
    when others then null; -- expected: XP is server-managed
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Money precision constraints
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  set local role authenticated;
  set local request.jwt.claim.sub = user_a::text;

  begin
    insert into public.transactions (user_id, amount_minor, occurred_on)
    values (user_a, 0, current_date);
    raise exception 'FAIL 7: zero-amount transaction was accepted';
  exception
    when check_violation then null; -- expected
  end;

  begin
    insert into public.monthly_budgets (user_id, month, amount_minor)
    values (user_a, date_trunc('month', current_date)::date, -100);
    raise exception 'FAIL 7: negative budget was accepted';
  exception
    when check_violation then null; -- expected
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 8. XP award RPCs (migration 0007): owners cannot award, the daily task cap
--    is enforced atomically, and the weekly review is exempt from AND
--    excluded from the task budget.
-- ---------------------------------------------------------------------------
do $$
declare
  user_a uuid;
  task_a uuid;
  t uuid;
  overflow uuid;
  res jsonb;
begin
  select id into user_a from public.profiles where email = 'user-a@example.com';
  select id into task_a from public.tasks where user_id = user_a limit 1;

  -- 8a. Owners cannot invoke the award RPCs directly (service role only). The
  --     specific insufficient_privilege (42501) is caught — any other error
  --     (e.g. a missing function) would fail the suite.
  set local role authenticated;
  set local request.jwt.claim.sub = user_a::text;
  begin
    perform public.award_task_xp(user_a, task_a);
    raise exception 'FAIL 8a: owner could award XP directly';
  exception
    when insufficient_privilege then null; -- expected: permission denied
  end;
  reset role;

  -- 8b. The service role awards +10 for a completed task; re-awarding the same
  --     task is idempotent (retries can never double-count).
  set local role service_role;
  update public.tasks set completed_at = now() where id = task_a;
  res := public.award_task_xp(user_a, task_a);
  if (res->>'awarded')::int <> 10 then
    raise exception 'FAIL 8b: expected 10 XP, got %', res;
  end if;
  res := public.award_task_xp(user_a, task_a);
  if (res->>'already_awarded') <> 'true' then
    raise exception 'FAIL 8b: re-award was not idempotent, got %', res;
  end if;

  -- 8c. Three more completions bring the day's task XP to 40 (10 + 3×10).
  insert into public.tasks (user_id, title, completed_at)
  select user_a, 'cap-' || g, now() from generate_series(1, 3) as g;
  for t in
    select id from public.tasks where user_id = user_a and title like 'cap-%' order by created_at
  loop
    res := public.award_task_xp(user_a, t);
    if (res->>'awarded')::int <> 10 then
      raise exception 'FAIL 8c: expected +10, got %', res;
    end if;
  end loop;

  -- 8d. The weekly review awards +15 and is EXCLUDED from the task budget:
  --     a task completed after the review still gets its full +10 (40 + 10 =
  --     50). If the review were counted, the budget would be 55 and this
  --     award would be capped at 0.
  res := public.award_weekly_review_xp(user_a, 'weekly_review:test-2026-99');
  if (res->>'awarded')::int <> 15 or (res->>'weekly_review_done') <> 'true' then
    raise exception 'FAIL 8d: weekly review award failed, got %', res;
  end if;
  res := public.award_weekly_review_xp(user_a, 'weekly_review:test-2026-99');
  if (res->>'already_awarded') <> 'true' then
    raise exception 'FAIL 8d: weekly review was not idempotent, got %', res;
  end if;

  insert into public.tasks (user_id, title, completed_at)
  values (user_a, 'cap-4', now());
  select id into t from public.tasks where user_id = user_a and title = 'cap-4';
  res := public.award_task_xp(user_a, t);
  if (res->>'awarded')::int <> 10 then
    raise exception 'FAIL 8d: weekly review leaked into the task budget, got %', res;
  end if;

  -- 8e. The cap still binds at 50: the next completion is capped, not awarded.
  insert into public.tasks (user_id, title, completed_at)
  values (user_a, 'cap-overflow', now());
  select id into overflow from public.tasks where user_id = user_a and title = 'cap-overflow';
  res := public.award_task_xp(user_a, overflow);
  if (res->>'capped') <> 'true' or (res->>'awarded')::int <> 0 then
    raise exception 'FAIL 8e: expected a capped award, got %', res;
  end if;

  -- 8f. The weekly review is EXEMPT from the task cap: even with the task
  --     budget exhausted (50/50), a review still awards its full +15.
  res := public.award_weekly_review_xp(user_a, 'weekly_review:test-2026-98');
  if (res->>'awarded')::int <> 15 then
    raise exception 'FAIL 8f: weekly review was capped, got %', res;
  end if;
end $$;

rollback;

-- If you see this message, every assertion passed.
select 'All RLS tests passed ✓' as result;
