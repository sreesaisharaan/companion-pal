# Companion Life — Supabase backend

Schema, RLS policies, and tests for the Companion Life backend.

## Layout

- `migrations/0001_profiles.sql` — profiles, `set_updated_at` helper
- `migrations/0002_tasks.sql` — `task_lists`, `tasks`, `task_occurrences`, `reminders`
- `migrations/0003_money.sql` — `budget_categories`, `transactions`, `monthly_budgets`
- `migrations/0004_companion.sql` — `companions`, `xp_events`, signup provisioning trigger
- `tests/rls_policies.sql` — self-contained RLS + trigger + constraint tests

## Rules baked into the schema

- Every user-owned table has `user_id` and Row Level Security enabled; policies
  restrict all operations to `auth.uid() = user_id`.
- Timestamps are `timestamptz` (UTC); render in the profile timezone.
- Money is **integer minor units** (`amount_minor`), never floating point.
- `xp_events` is append-only with a `unique (user_id, idempotency_key)` guard so
  retried reward writes can never double-count.
- XP is **read-only for clients**: owners can read `xp_events` but never write,
  and a trigger blocks direct edits to `companions.xp`/`stage`. Only the service
  role (the Phase 2 Edge Function) can award XP.

## Setup

1. Create a Supabase project (or run `supabase start` for local dev).
2. Apply migrations in order. With the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   Or copy each file into the dashboard SQL editor in order (0001 → 0004).
3. Enable **Email** provider under Authentication → Providers (or the social
   providers you want; the app currently uses email/password).
4. Copy `mobile/.env.example` to `mobile/.env` and fill in:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

   The anon key is public by design. The service_role key must never ship in the app.

## Running the RLS tests

Open `tests/rls_policies.sql` in the Supabase SQL editor and run the whole file.
It runs inside a transaction and raises on the first failure; finishing with
`All RLS tests passed ✓` means isolation, provisioning, idempotency, and money
constraints all hold. The two test users never persist.

## Notes

- The signup trigger (`handle_new_user`) is `security definer` with a pinned
  `search_path`, and provisions both the profile and companion in one shot.
- XP totals are derived from `xp_events`; awarding logic (daily caps, stage
  recalculation) is an Edge Function in Phase 2 so the service role key stays
  server-side only.
