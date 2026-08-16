-- 0010_task_lists_unique.sql
-- One task list per (user_id, name).
--
-- The client get-or-creates task lists by name (resolveListId), mirroring the
-- category pattern that 0009 hardened: without a unique index, concurrent
-- saves of a never-used list name would both insert, producing duplicate
-- lists. The table is new (the app has never written to it), so no
-- deduplication pass is needed — only the constraint.
create unique index task_lists_user_name_idx
  on public.task_lists (user_id, name);
