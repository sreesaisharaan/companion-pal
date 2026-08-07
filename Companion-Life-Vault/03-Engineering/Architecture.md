# Architecture

## Recommended stack

| Layer | Choice |
|---|---|
| Mobile | React Native, Expo, TypeScript, Expo Router |
| State | TanStack Query + lightweight local UI state |
| Backend | Supabase Auth, Postgres, Edge Functions, Storage |
| Notifications | Expo Notifications; scheduled locally, server-driven only when needed |
| Observability | privacy-conscious crash/error reporting and product analytics |

## Data model

- `profiles`: user settings, timezone, preferred currency.
- `task_lists`, `tasks`, `task_occurrences`: capture and recurrence-friendly completion history.
- `reminders`: scheduled reminder settings and delivery state.
- `transactions`, `budget_categories`, `monthly_budgets`: manual financial records.
- `companions`: species, stage, XP, cosmetic state.
- `xp_events`: append-only reward ledger with source and idempotency key.

Every user-owned row has `user_id`. Enable Row Level Security for every public table; policies must restrict reads/writes to `auth.uid() = user_id`. Keep the service-role key only in server environments.

## Core rules

- Store timestamps in UTC; render using the profile timezone.
- Treat money as integer minor units (for example, paise/cents), never floating point.
- Generate XP server-side or validate it through an Edge Function; make reward writes idempotent.
- Cache Today data locally and reconcile on reconnect.

## Notification design

For the MVP, schedule device-local notifications after permission. Reschedule on edit, completion, timezone change, or app restart. Record app state but do not assume notification delivery proves the user saw it.
