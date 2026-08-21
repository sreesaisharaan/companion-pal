# Companion Life — Supabase backend

Schema, RLS policies, and tests for the Companion Life backend.

## Layout

- `migrations/0001_profiles.sql` — profiles, `set_updated_at` helper
- `migrations/0002_tasks.sql` — `task_lists`, `tasks`, `task_occurrences`, `reminders`
- `migrations/0003_money.sql` — `budget_categories`, `transactions`, `monthly_budgets`
- `migrations/0004_companion.sql` — `companions`, `xp_events`, signup provisioning trigger
- `migrations/0005…0010` — reminders device id, currency/timezone auto prefs, unique lists
- `migrations/0011_clerk_user_ids.sql` — Clerk auth: text user ids, RLS on `auth.jwt()->>'sub'`
- `tests/rls_policies.sql` — self-contained RLS + trigger + constraint tests
- `functions/` — Edge Functions (`award-xp`, `delete-account`) that verify Clerk tokens

## Rules baked into the schema

- Every user-owned table has `user_id` and Row Level Security enabled; policies
  restrict all operations to `auth.jwt()->>'sub' = user_id` (the Clerk user id).
- Timestamps are `timestamptz` (UTC); render in the profile timezone.
- Money is **integer minor units** (`amount_minor`), never floating point.
- `xp_events` is append-only with a `unique (user_id, idempotency_key)` guard so
  retried reward writes can never double-count.
- XP is **read-only for clients**: owners can read `xp_events` but never write,
  and a trigger blocks direct edits to `companions.xp`/`stage`. Only the service
  role (the Edge Function) can award XP.

## Setup

1. Create a Supabase project (or run `supabase start` for local dev).
2. Apply migrations in order. With the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

   Or copy each file into the dashboard SQL editor in order (0001 → 0011).
3. Auth is **Clerk**: add Clerk as a third-party auth provider under
   Authentication → Sign In / Up → Third Party Auth, using the Clerk Domain from
   Clerk's Supabase integration page. That lets Supabase verify Clerk session
   tokens, whose `sub` claim carries the Clerk user id (migration 0011's RLS
   policies read exactly that claim).
4. Copy `mobile/.env.example` to `mobile/.env` and fill in:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk publishable key>
   CLERK_SECRET_KEY=<Clerk secret key>
   ```

   The anon and publishable keys are public by design. The service_role and
   Clerk secret keys must never ship in the app; the latter only lives in
   Supabase secrets for the Edge Functions:

   ```bash
   supabase secrets set CLERK_SECRET_KEY=<secret key>
   # Optional: restrict the edge functions to specific web origins (omit for
   # "*" in development). Set it before deploying production.
   supabase secrets set ALLOWED_ORIGINS=https://your-web-app.example.com
   supabase functions deploy award-xp delete-account
   ```

## Running the RLS tests

Open `tests/rls_policies.sql` in the Supabase SQL editor and run the whole file.
It runs inside a transaction and raises on the first failure; finishing with
`All RLS tests passed ✓` means isolation, provisioning, idempotency, and money
constraints all hold. The test users never persist.

## Notes

- With Clerk there is no `auth.users` row to hook, so the **app** upserts the
  profile row on first login (best-effort, retried next launch). The
  `on_profile_created` trigger (`handle_new_user`, `security definer` with a
  pinned `search_path`) then provisions the companion.
- User-owned tables keep their cascade FK to `profiles`, so `delete-account`
  removes every row a user owns in one delete.
- XP totals are derived from `xp_events`; awarding logic (daily caps, stage
  recalculation) lives in the `award-xp` Edge Function so the service role key
  stays server-side only.
