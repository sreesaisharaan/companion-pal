-- 0007_xp_award_rpc.sql
-- Atomic, serialised XP awards.
--
-- The client never decides reward amounts and can never call these directly:
-- award-xp (Edge Function, service role) validates the JWT and delegates the
-- actual award to one of these RPCs. Both are security definer (owner =
-- postgres) and their EXECUTE is revoked from anon/authenticated, so only the
-- service role can invoke them.
--
-- Why a database function instead of plain client inserts?
--   * Serialisation — each function takes a per-user lock (SELECT ... FOR
--     UPDATE on the companion row), so awards for one user run one at a time.
--     Two concurrent completions can no longer both pass the daily-cap check
--     and overshoot the 50 XP/day ceiling.
--   * Consistency — the companion's derived xp/stage is recomputed and written
--     in the same transaction as the ledger insert, so the companion can never
--     lag the ledger under concurrency.
--   * Idempotency — the (user_id, idempotency_key) unique constraint still
--     makes retries and uncomplete → recomplete safe.
--
-- Budgets: the daily cap (50 XP, UTC day) counts TASK completions only. The
-- weekly review is exempt from the cap and is excluded from the task budget —
-- it has its own once-per-ISO-week budget, keyed by idempotency_key (computed
-- client-side as `weekly_review:<ISO week>` and passed in).
--
-- Award amounts live here, server-side: task completion +10, on-time bonus +5,
-- weekly review +15. The mobile Companion screen's XP_RULES text and the TS
-- STAGE_THRESHOLDS (250 growing / 750 thriving) mirror these — keep them in
-- sync when changing any amount.
--
-- Both functions assume the companion row exists (the signup trigger in
-- 0004_companion.sql provisions it); the row lock doubles as the per-user
-- serialisation point.

create or replace function public.award_task_xp(p_user_id uuid, p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_due timestamptz;
  v_task_done timestamptz;
  v_requested integer := 10; -- base: task completed
  v_today bigint;            -- task XP since the start of the UTC day
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

  -- Task XP earned since the start of the current UTC day. Weekly reviews are
  -- a separate budget and are excluded here.
  select coalesce(sum(amount), 0) into v_today
  from public.xp_events
  where user_id = p_user_id
    and source <> 'weekly_review'
    and created_at >= date_trunc('day', now());

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

create or replace function public.award_weekly_review_xp(p_user_id uuid, p_idempotency_key text)
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
revoke execute on function public.award_task_xp(uuid, uuid) from public, anon, authenticated;
grant execute on function public.award_task_xp(uuid, uuid) to service_role;
revoke execute on function public.award_weekly_review_xp(uuid, text) from public, anon, authenticated;
grant execute on function public.award_weekly_review_xp(uuid, text) to service_role;
