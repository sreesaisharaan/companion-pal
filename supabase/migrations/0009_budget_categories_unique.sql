-- 0009_budget_categories_unique.sql
-- One category per (user_id, name).
--
-- The client get-or-creates categories by name (resolveCategoryId). Without a
-- unique constraint, two concurrent saves of a never-used category both insert,
-- producing duplicate category rows — confirmed under load testing: 20 parallel
-- saves created 20 identical rows, which then rendered as duplicate bars and
-- duplicate React keys on the Money screen. This migration collapses existing
-- duplicates (transactions keep pointing at the earliest surviving row) and
-- then enforces uniqueness, making the client's 23505 fallback real.

-- 1. Deduplicate: for each (user_id, name) keep the earliest row, repoint every
--    transaction at it, and delete the rest. monthly_budgets rows cascade with
--    their category row (they were keyed on one specific duplicate id).
do $$
declare
  r record;
  keep uuid;
begin
  for r in
    select user_id, name
    from public.budget_categories
    group by user_id, name
    having count(*) > 1
  loop
    select id into keep
    from public.budget_categories
    where user_id = r.user_id and name = r.name
    order by created_at asc, id asc
    limit 1;

    update public.transactions
    set category_id = keep
    where user_id = r.user_id
      and category_id in (
        select id from public.budget_categories
        where user_id = r.user_id and name = r.name and id <> keep
      );

    delete from public.budget_categories
    where user_id = r.user_id and name = r.name and id <> keep;
  end loop;
end $$;

-- 2. Enforce uniqueness going forward.
create unique index budget_categories_user_name_idx
  on public.budget_categories (user_id, name);
