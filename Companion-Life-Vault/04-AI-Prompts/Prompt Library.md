# AI Coding Assistant Prompt Library

Replace bracketed fields before pasting. Ask for one phase at a time; review the plan and code before moving on.

## 1. Discovery

```text
Act as a mobile product strategist. I am building [APP NAME], an iOS/Android app for [AUDIENCE] that combines tasks, reminders, manual monthly spending tracking, and a non-judgmental creature companion that evolves from completed actions. Backend: Supabase. Run a focused discovery workshop: assumptions, 8 interview questions, 3 personas, jobs-to-be-done, risks, MVP vs later, and measurable activation/retention metrics. Do not propose bank syncing or social features for MVP. End with a ranked backlog and open decisions.
```

## 2. UX and content design

```text
Act as a senior mobile UX designer. Design the MVP flows for quick task capture, Today, notification response, manual expense capture, monthly spending summary, and companion progression for [APP NAME]. Produce an information architecture, screen-by-screen requirements, empty/loading/error states, microcopy, accessibility notes, and a low-fidelity text wireframe. The companion must reward progress without shaming missed tasks. Keep forms fast and one-handed.
```

## 3. Architecture

```text
Act as a staff mobile engineer. Recommend React Native + Expo + TypeScript or Flutter for [APP NAME], stating the decision criteria and a clear recommendation. Then design a Supabase-backed architecture: modules, auth, offline strategy, notification strategy, data flow, secrets handling, observability, and an incremental implementation order. Store money as integer minor units, timestamps in UTC, and enforce per-user Row Level Security. Keep the MVP simple.
```

## 4. MVP implementation plan

```text
Turn this product into a 6-week implementation plan for [APP NAME] using [React Native + Expo OR Flutter] and Supabase. Break work into small, testable tickets with acceptance criteria, dependencies, and demo checkpoints. Include tasks, reminders, manual monthly expenses, monthly category totals, companion XP/evolution, analytics, accessibility, and app-store readiness. Identify the smallest vertical slice to build first.
```

## 5. Supabase backend

```text
Act as a Supabase expert. Generate production-minded SQL migrations for profiles, task_lists, tasks, task_occurrences, reminders, transactions, budget_categories, monthly_budgets, companions, and xp_events for [APP NAME]. Include indexes, constraints, timestamps, soft-delete choice, and comprehensive RLS policies limiting each user to their own data. Use integer minor units for money. Add a safe RPC or Edge Function design for idempotent XP awards; never expose the service role key to the app. Explain how to test the policies.
```

## 6. Mobile app build

```text
You are implementing [APP NAME] in [STACK]. Create the project structure and the first vertical slice: Supabase authentication, a Today screen, create/complete a task, local notification scheduling, and companion XP feedback. Use TypeScript/Dart idiomatically, separate UI/domain/data concerns, handle loading/error/offline states, and write tests for core business rules. Present files one at a time and explain setup commands and environment variables without placing secrets in source control.
```

## 7. Creature and evolution

```text
Design and implement a gentle companion system for [APP NAME]. Define three visual stages, an XP ledger, daily caps, idempotency keys, celebratory animations, reduced-motion mode, and user-facing explanations. Reward task completion and weekly planning; do not penalize missed items or use manipulative streaks. Provide domain models, server validation approach, test cases, and sample UI states.
```

## 8. Testing and hardening

```text
Act as a mobile QA lead. Create a risk-based test plan for [APP NAME]. Cover authentication, RLS isolation, recurring tasks, edits/cancellations, notification permissions and timezones, daylight-saving transitions, offline/reconnect conflicts, money precision, accessibility, data export/delete, companion XP idempotency, and performance. Provide manual test cases, automated-test priorities, beta exit criteria, and severity definitions.
```

## 9. Launch

```text
Act as an indie mobile launch manager. Prepare a privacy-respecting beta and launch plan for [APP NAME] on iOS and Android: store-listing copy, screenshot story, privacy policy checklist, support workflow, analytics dashboard, staged rollout criteria, crash/notification monitoring, and a 30-day learning agenda. Avoid claims that imply financial advice or guaranteed productivity.
```
