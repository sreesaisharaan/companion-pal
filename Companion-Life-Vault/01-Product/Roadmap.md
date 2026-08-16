# Roadmap

## Phase 0 — Discovery (1–2 weeks)

Interview 5–8 target users; validate the combined value proposition; choose React Native or Flutter; define privacy boundaries and MVP metrics.

**Exit:** problem statement, primary persona, ranked backlog, clickable core flow.

## Phase 1 — Experience & foundation (1–2 weeks) — **IN PROGRESS (kickoff 2026-08-04)**

Create a small design system, task/reminder/money flows, companion states, Supabase project, authentication, and data schema.

**Exit:** approved flows, migrations, row-level security tests, app shell.

**Done (kickoff):** Expo SDK 57 app shell in `mobile/` (5 tabs, design system, auth wiring, session guard); Supabase migrations + RLS tests in `supabase/`.

**Next:** run the RLS test script against a Supabase project, wire `.env`, approve the screen flows, then start the Phase 2 vertical slice (task capture → Today → notification → completion → XP).

## Phase 2 — MVP build (4–6 weeks) — **IN PROGRESS**

Ship task capture, Today, notifications, manual spending, monthly insights, and the baseline companion progression.

**Exit:** internal beta supports the complete daily loop: add → remind → complete → reward → review.

**Slice 1 (done 2026-08-05):** task capture + Today list + completion + server-side XP reward (`award-xp` Edge Function, idempotent `xp_events`). Companion screen reads real stage/XP. E2E-verified with a confirmed account; RLS isolation proven.

**Slice 2 (in progress):** money entry landed (transactions → category totals, add/edit/delete, range filters) and Today shows the real month snapshot. Remaining: monthly budget indicators, then local notifications (expo-notifications, permission + scheduling/rescheduling).

## Phase 3 — Quality beta — **IN PROGRESS**

Test timezones, recurring schedules, offline/reconnect behavior, accessibility, privacy, analytics, and real-device notification delivery.

**Done (2026-08-05 hardening slice):** weekly review (+15 XP, once per ISO week, cap-exempt, idempotent); recurring tasks (daily/weekly/monthly with guarded next-occurrence spawn); privacy (export all data + account deletion via `delete-account` Edge Function, cascade-verified, idempotent); offline/reconnect query resilience; RLS isolation proven live with two accounts; XP idempotency proven (re-invoke → already_awarded).

**Done (budget + RLS suite 2026-08-05):** monthly budget indicators (set/edit/remove per category, progress bars, over-budget state, live-verified); RLS test suite executed against the cloud project — all 7 assertion groups pass (two portability fixes: schema-qualified pgcrypto, real `auth.users` test rows).

**Done (notifications 2026-08-05):** the “remind” step — `expo-notifications` with a 9:00 AM local reminder per due task, `reminders`-table intent recording (migration 0005 adds `device_notification_id`), cancel-on-complete, recurring next-occurrence scheduling, and a Profile opt-in toggle. Native-only; real-device fire/cancel verification remains.

**Next:** real-device notification verification (iOS + Android), analytics, accessibility pass.

## Phase 3 — Quality beta (2–3 weeks)

Test timezones, recurring schedules, offline/reconnect behavior, accessibility, privacy, analytics, and real-device notification delivery.

**Exit:** crash-free target met, feedback triaged, store assets ready.

## Phase 4 — Launch & learn (2 weeks) — **IN PROGRESS**

Release gradually, monitor funnels and reliability, interview active and churned users, then prioritise the next smallest improvement.

**Done (store-readiness 2026-08-05):** app.json metadata (bundle IDs, version 1.0.0, permissions, notification icon), `eas.json` build/submit profiles, `secrets/` gitignored. expo-doctor 20/20 + production web export pass.

**Done (real brand art 2026-08-07):** logo-based icon set (app icon, splash, favicon, Android adaptive foreground/background/monochrome, white notification glyph) plus the three companion stage creatures (SVG → PNG) shown across every tab screen (header badges on Plan/Money/Profile, hero cards on Today/Companion), sign-in, and the loading shell — all generated from `assets/source/` by the sharp pipeline in `mobile/scripts/generate-assets.mjs` (`npm run assets`). Leftover Expo template art removed.

**Done (UI/UX consistency + locale-aware currency 2026-08-06):** `use-currency` hook (expo-localization device currency, `profiles.preferred_currency` preference `'auto' | ISO`, `formatCurrency` everywhere — no more hardcoded USD); Currency picker in Profile; shared design tokens (`cardPrimary`/`cardSecondary`/`ctaPrimary`/chip/progress) and components (`ScreenHeader`, `CTAButton`, `SegmentedControl`, `Card variant`, `ProgressBar`); one light hero card per screen with dark supporting cards. Verified live end-to-end (INR override reformats every screen); typecheck + lint clean.

**Done (companion naming 2026-08-16):** `companions.name` is now set from the Companion tab — a one-time "Name your companion" bottom sheet auto-offers when the companion first loads unnamed (dismissible; the hero keeps a "Give them a name" link as fallback). Once named, the hero shows the name and tapping it reopens the sheet prefilled for renaming. Owner-updatable via existing RLS; verified live on Android: sheet auto-open → save → hero shows name → rename → force-stop + cold relaunch (persisted in Supabase).

**Done (load/force-test hardening 2026-08-16):** stress-tested the app against 400+ tasks/transactions and parallel backend calls (`mobile/scripts/stress-test.mjs`). Findings + fixes: (1) **list virtualization** — Today/Money rendered every row eagerly in a ScrollView (no FlatList); converted both to virtualized FlatLists (header/footer components), cutting native heap −19% and Java heap −24% at 400 rows with scrolling + toggles verified; (2) **category uniqueness** — `budget_categories` had no unique (user_id, name) constraint, so 20 concurrent get-or-creates made 20 duplicate rows; migration 0009 dedupes (repointing transactions to the earliest row) and adds the unique index, making the client's 23505 fallback real (re-test: 20 parallel → 1 row); (3) **client dedup bug** — `visibleCategories` only deduped suggested names, so duplicate rows rendered as duplicate React keys (39-error storm); now dedupes existing names too. Also proven under fire: XP award + weekly review stay exactly-once under 30/20 concurrent calls, and offline (airplane mode) causes no crash — drafts preserved and queries recover on reconnect. All seeded data cleaned up afterward.

**Done (task notes + lists 2026-08-16):** the schema's unused `notes`/`list_id` columns are now live. Capture and the edit sheet gained a Notes field and a list picker (No list + Errands/Study/Life admin presets, get-or-create by name); TaskRow shows the list name and notes; Today's Next-up list groups under per-list headers (inside the virtualized FlatList); the Plan tab's placeholder card now lists real task lists. Migration 0010 adds `unique(task_lists.user_id, name)` — the same concurrency hardening as 0009 — pushed and verified (duplicate insert → 23505 → client fallback absorbs it). Verified live on Android: capture with notes+list → get-or-create materialises the list → group header + list + notes render → edit moves the task to another (newly materialised) list. Test data cleaned up; typecheck + lint clean.

**Next:** run `eas init` + `eas build` (development build on a real device → verify notifications), then store listing (screenshots, privacy policy, support contact).

## Sequencing principle

Reliable reminders and quick capture are the product’s foundation. Companion delight amplifies a dependable loop; it cannot compensate for missed reminders.
