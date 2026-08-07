# Companion Evolution System

## Simple, explainable model

XP is earned only for helpful actions. Suggested values: task completion +10, on-time completion +5, completing a planned reminder +5, adding a transaction +2 (cap 3/day), weekly review +15. Never award XP merely for opening the app.

| Stage | XP threshold | Player feeling |
|---|---:|---|
| Hatchling | 0 | “We’re starting together.” |
| Growing | 250 | “My routines are taking shape.” |
| Thriving | 750 | “I’ve built momentum.” |

## Safeguards

No XP loss, no penalty for missed reminders, and no dark-pattern urgency. Allow rewards to be reduced or disabled. Daily XP caps prevent grinding and protect the meaning of milestones.

## Implementation

Write an `xp_events` row with a unique idempotency key such as `task:{task_id}:completion:{occurrence_id}`. An Edge Function verifies the source, inserts only once, recalculates total XP, determines stage, and returns the updated companion. The client animates only after confirmed success (with an optimistic, reversible preview if desired).
