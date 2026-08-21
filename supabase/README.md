# Companion Life — Supabase backend

Schema, RLS policies, and tests for the Companion Life backend.

## Layout

- `migrations/0001_profiles.sql` — profiles, `set_updated_at` helper
- `migrations/0002_tasks.sql` — `task_lists`, `tasks`, `task_occurrences`, `reminders`
- `migrations/0003_money.sql` — `budget_categories`, `transactions`, `monthly_budgets`
- `migrations/0004_companion.sql` — `companions`, `xp_events`, signup provisioning trigger
- `migrations/0005…0010` — reminders device id, currency/timezone auto prefs, unique lists
- `migrations/0011_clerk_user_ids.sql` — Clerk auth: text user ids, RLS on `auth.jwt()->>'sub'`
- `migrations/0012_category_emoji_and_validation.sql` — category emoji + note length checks
- `tests/rls_policies.sql` — self-contained RLS + trigger + constraint tests
- `functions/` — Edge Functions (`award-xp`, `delete-account`) that verify Clerk tokens
- `functions/_shared/` — shared Edge Function helpers (CORS allowlist, ISO-week key)

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
   # Restrict the edge functions to your real web origin(s). This is ENFORCED:
   # every function reflects an incoming Origin back only when it is on the
   # list, so any other site is blocked by the browser. Omit it only in
   # development.
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

## Known decisions

- **Server-side XP + stage, read-only clients.** `companions.xp`/`stage` derive
  from the `xp_events` ledger and can only be written by the service role; a
  trigger blocks direct client edits and `xp_events` has no client insert path.
- **The daily XP cap resets at the user's local midnight**, read from
  `profiles.timezone` (falls back to UTC), not UTC midnight — so a far-ahead
  timezone never shares a truncated budget across their day.
- **Transaction currency is stored per row.** Totals and budget bars only sum
  transactions in the current display currency, so changing the preferred
  currency never mis-labels history or adds mixed-currency amounts. A one-way
  migration of legacy USD rows to a new currency is a deliberate product call
  and is intentionally *not* done automatically.
- **Reminders and weekly-review preferences are device-local** (AsyncStorage /
  expo-notifications). Do not silently "sync" them to the server without a
  product decision about which device is authoritative — a server push and
  per-device delivery are two different features.
- **Offline writes are best-effort.** Reads refetch on reconnect; mutations
  pause and retry once but are not queued yet. A durable offline queue is a
  future feature.

## Shipping

- `build-apk.yml` builds an installable release APK with the **debug keystore**
  (the same key Expo Go "preview" builds use), so it installs on any device.
  Before public store submission, wire in a store-distribution keystore and
  real versioning/OTA — see the comment at the top of that workflow.
