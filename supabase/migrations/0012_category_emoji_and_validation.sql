-- 0012_category_emoji_and_validation.sql
-- Two small hardening changes for the Money/Task screens:
--   1. A per-category emoji column so custom (get-or-created) categories keep a
--      meaningful icon in the Money breakdown, with the built-in suggestions
--      backfilled.
--   2. Length constraints on the free-text notes columns (the app truncates
--      input, but a stray/malicious client could otherwise bloat rows).

alter table public.budget_categories
  add column emoji text;

comment on column public.budget_categories.emoji
  is 'Optional single glyph for the Money breakdown; null falls back to a neutral icon.';

-- Backfill the built-in suggested categories (mirrors mobile DEFAULT_CATEGORIES).
update public.budget_categories
set emoji = case name
  when 'Groceries' then '🛒'
  when 'Transport' then '🚌'
  when 'Fun' then '🎬'
  else emoji
end
where name in ('Groceries', 'Transport', 'Fun');

-- Bound free-text notes. Category names are already bounded in 0003.
alter table public.transactions
  add constraint transactions_note_length
  check (note is null or char_length(note) <= 2000);

alter table public.tasks
  add constraint tasks_notes_length
  check (notes is null or char_length(notes) <= 2000);