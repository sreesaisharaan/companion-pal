# Companion Life Home

## Start here

1. Read [[01-Product/Product Brief]] and choose the initial audience.
2. Use [[01-Product/Roadmap]] to keep the first release deliberately small.
3. Validate screens with [[02-UX/Experience Design]].
4. Set up from [[03-Engineering/Architecture]].
5. Use [[04-AI-Prompts/Prompt Library]] one phase at a time.

## Decision log

| Decision | Default | Your choice | Date |
|---|---|---|---|
| Client | React Native + Expo | React Native + Expo (SDK 57) | 2026-08-04 |
| Backend | Supabase | Supabase | 2026-08-04 |
| Primary audience | Busy students / early professionals | Busy students / early professionals | 2026-08-04 |
| Companion style | warm, non-judgmental | warm, non-judgmental | 2026-08-04 |
| Design system | — | Monochrome black & white (structural inspiration from dashboard/travel mockups) | 2026-08-05 |
| Client state | TanStack Query | TanStack Query (v5) | 2026-08-05 |
| XP award path | Edge Function, service role | `award-xp` Edge Function deployed | 2026-08-05 |

## Phase 1 status (kickoff 2026-08-04)

Phase 1 is in progress. Completed so far:

- **App shell** — Expo SDK 57 + Expo Router + TypeScript scaffolded in `mobile/` with the five tabs (Today, Plan, Money, Companion, Profile) and a warm design system (`src/constants/theme.ts`).
- **Auth wiring** — Supabase client with AsyncStorage persistence, sign-in/sign-up screen, and session-gated navigation (`src/lib/`). Works headless until credentials are added.
- **Data schema + RLS** — migrations in `supabase/migrations/` (profiles, tasks/occurrences/reminders, money, companion/XP) with per-user policies and a signup provisioning trigger.
- **RLS tests** — `supabase/tests/rls_policies.sql` (run in the Supabase SQL editor).

## Phase 2 status (MVP build)

Phase 2 slice 1 (task loop: capture → complete → reward) is built and E2E-verified:

- **Real task data** — TanStack Query data layer (`src/lib/api/`) drives Today: quick capture (title + No time/Today/Tomorrow), today's open tasks, completion toggles, and a Done-today section.
- **Companion on real data** — stage, XP, and progress come from the `companions` table (provisioned at signup).
- **Server-side XP** — `award-xp` Edge Function deployed to the project: verifies the caller, awards 10 XP (15 on-time), writes idempotent `xp_events`, and recalculates stage. The service-role key never ships in the app. Fixed a web-only CORS bug (preflight is now answered before the auth check — browser completes now award XP).
- **Money entry flow (slice 2a)** — `src/lib/api/money.ts` + rebuilt Money screen: real range totals (This week / month / all), category bars, transaction list with edit + two-tap delete, and an add/edit bottom sheet (amount, expense/income, category get-or-create, date stepper, note). Today's "This month" snapshot shows the real total.
- **Supabase connected** — `mobile/.env` wired, migrations applied, all tables live.
- **E2E verified with a real account** — a confirmed test user was created via the admin API and the full loop driven in the app: sign-in session restore, task capture → complete → 10 XP awarded from the browser, transactions add/edit/delete with live totals, and RLS isolation (a second user sees zero rows and gets 403 on cross-user writes).

## Phase 3 status (quality beta)

Hardening slice landed 2026-08-05:

- **Weekly review** — Plan tab now has a live review card (tasks done, XP earned, money moved this week) and a "Complete review · +15 XP" action. `award-xp` gained a `weekly_review` source: +15 XP, once per ISO week, exempt from the daily cap, idempotent via `weekly_review:{iso-week}` ledger key.
- **Recurring tasks** — Capture has Once/Daily/Weekly/Monthly repeat; completing a recurring task spawns the next occurrence (guarded, so retries can't double-create).
- **Privacy** — Profile has Export my data (full JSON of all 6 tables; downloads on web, share sheet on native) and Delete my account (two-tap confirm → `delete-account` Edge Function; FK cascade removes every row). Verified live on a throwaway account: user gone, zero orphan rows, idempotent retry.
- **Offline/reconnect resilience** — queries pause offline and refetch on reconnect/window-focus; XP idempotency proven by re-invoking the review (already_awarded, XP unchanged).
- **Monthly budget indicators** — per-category monthly caps on the Money screen (set/edit/remove, upsert on `unique(user_id, category_id, month)`), progress bars on category rows, and an over-budget state ("over by $X", bold emphasis). Verified live: set $100, progress bar rendered, over-budget triggered, reset to demo state.
- **RLS test suite executed against the cloud project** — all 7 assertion groups verified live (XP-farm rejection, XP-bump rejection, money constraints, cross-user 403). Two portability bugs fixed in the suite: pgcrypto now schema-qualified (`extensions.gen_salt/crypt`), and test users now created via `auth.users` (the signup trigger provisions profiles) instead of orphaned profile inserts.
- **Local notifications (the “remind” step)** — `expo-notifications` wired: capture with a due date schedules a 9:00 AM local reminder (recorded in the `reminders` table with the device notification id via migration 0005), completing a task cancels it and marks the row delivered/acknowledged, recurring spawns schedule their next occurrence, and Profile has a real opt-in toggle with permission handling. Native-only by design — web shows a note and the Today screen stays the reminder. Scheduling verified end-to-end in code; final fire/cancel verification needs a real device. Note: on Android, expo-notifications was removed from Expo Go in SDK 53 (requiring it throws), so the app now detects Expo Go and runs with notifications unavailable — the in-app screens remain the reminder. Test reminders in a development build.

## Phase 4 status (launch & learn)

Store-readiness slice landed 2026-08-05:

- **Real brand art** — the app icon, splash, favicon, Android adaptive set (white background layer + self-contained black-disc foreground + monochrome creature silhouette), and the white notification glyph all derive from the brand logo (`assets/source/logo.png` — a black disc with a white creature-flame mark). The three companion stage creatures (hatchling seed/egg → growing flat variant → thriving mascot) are rasterized from `assets/source/companion/*.svg` and shown across every tab screen (header badges on Plan/Money/Profile, hero cards on Today/Companion), sign-in, and the loading shell. Everything is generated by `mobile/scripts/generate-assets.mjs` (sharp-based; `npm run assets`). All Expo placeholder art removed.
- **app.json metadata** — version 1.0.0, `ios.bundleIdentifier` + `android.package` = `com.companionlife.app`, buildNumber/versionCode 1, Android permissions (`VIBRATE`, `RECEIVE_BOOT_COMPLETED`), iOS icon points at the real icon, notification icon wired into the expo-notifications plugin, store support/privacy placeholders under `extra.store`.
- **EAS build config** — `eas.json` with development / preview (internal APK) / production (store) profiles + a submit profile; `secrets/` gitignored. expo-doctor 20/20 and a full production web export pass.

Still open: real-device verification of notifications (iOS + Android), an accessibility pass, a real signup from the app when your email rate limit allows, and an EAS build on your account (run `eas init` then `eas build`).

## UI/UX consistency & locale-aware currency round (2026-08-06)

- **Locale-aware currency** — new `hooks/use-currency.ts` is the single source of truth: device currency via `expo-localization` (`getLocales()[0].currencyCode`, USD fallback), preference persisted on `profiles.preferred_currency` (`'auto' | ISO 4217`, migration 0006 defaults new rows to `'auto'`), and `formatCurrency(amountMinor)` via `Intl.NumberFormat`. Every amount in the app now flows through it — Money net/categories/budgets/transactions, Today's Spending Snapshot (badge shows the local symbol, e.g. ₹), Plan's weekly money-moved stat, and transaction rows. Profile has a real **Currency** picker (bottom sheet: Auto (device) + 16 common codes, busy/error handled, closes only on success); the row shows `Auto (device) · USD` or `INR · ₹`. Verified live: locked INR → every amount reformatted to ₹ across all screens, persisted across restarts.
- **Design tokens** — `theme.ts` gained `cardPrimary`/`cardSecondary`/`ctaPrimary`/`chipSelected`/`chipOnSelected`/`chipUnselected`/`progressFill`/`progressTrack`; `Card` now has `variant="primary|secondary"` and provides a context so `ThemedText`/`IconButton`/`Button` default to the on-fill ink inside dark cards (no per-text overrides).
- **Shared components** — `ScreenHeader` (brand eyebrow on all 5 tabs, incl. Today), `CTAButton` (solid-ink primary actions — distinct from selected pills), `SegmentedControl` (filter/segmented pills: due, repeat, ranges, expense/income, category), `Card variant`, `ProgressBar` (shared fill tokens).
- **Card hierarchy** — exactly one light hero card per screen (Today companion check-in, Plan weekly review, Money net total, Companion XP, Profile account); every informational card (Capture, Next up, snapshot, Lists, Repeating reminders, journey, XP rules, prefs, reminders, data) standardized to the dark `cardSecondary`. PageHeader removed; `page-header.tsx` deleted.
- **Verified** — typecheck ✓ lint ✓; live check of hero (raised sheet) vs secondary (dark) fill via computed styles; all queries 200; console clean. Still to confirm on a device: light-mode rendering (the preview webview prefers dark — the token pair is symmetric).

## Core promise

“A gentle companion that helps me remember life, understand this month’s spending, and feel rewarded for small progress.”
