# Companion Life — Privacy Policy

_Last updated: 2026-08-21 (draft — support contact and store-specific policies to be completed with the store account before beta)._

## Overview

Companion Life is a private, offline-friendly personal organisation app for tasks, spending, a companion, and small progress. It has **no ads, no tracking, and no third-party analytics**. Your data is stored in your own app installation and synchronised to a private cloud database so it follows you across your own devices.

This policy explains what the app collects, why, where it lives, and your controls over it.

## What we collect

- **Account (via Clerk).** Your email address and the credentials (password and/or an OAuth provider such as Google, Apple, or GitHub) you sign in with are handled by Clerk, our authentication provider. Clerk stores your sign-in credentials; the app stores only your Clerk user id in the project database.
- **Profile.** Display email, and two display preferences you set (currency and timezone — either automatic or your manual choice).
- **Tasks.** Titles, optional notes, optional list name, due date, recurrence, and completion state that you enter. Used only to show your plan and to schedule gentle local reminders.
- **Money.** Amounts you enter (stored as integers to avoid rounding drift), the categories you tag them with, and monthly budget amounts. Used only to show your own totals and budgets. The app does not connect to banks and does not see financial outcomes.
- **Companion & progress.** An XP ledger derived from your task completions and weekly reviews, and the name/stage you give your companion. Weekly review stats (tasks done, XP, money movement) are shown back to you.
- **Reminders.** A small record of which local notification was scheduled so it can be cancelled, plus a device-local preference opt-in.

## Where your data lives

- **Clerk** (authentication provider) stores your login credentials and issues your session. Sessions are persisted on your device in the platform secure store.
- **Supabase** (hosted PostgreSQL + edge functions) stores the rows above. Data is transmitted over HTTPS.

## What we do *not* do

- No advertising or third-party tracking/analytics.
- No selling or sharing of your data.
- No scanning of tasks or messages.
- Local reminders are scheduled on your device; nothing is broadcast or uploaded beyond the reminder intent record above.

## Your controls

- **Appearance, currency, timezone:** changeable in-app; stored on your profile.
- **Export:** you can download your own data (every table you own) at any time from Profile.
- **Deletion:** you can permanently delete your account from Profile. This removes your Clerk account and every row you own (tasks, transactions, budgets, companion, XP) — with no backups kept by the app.

## Retention & children

- Data is kept while your account is active; deleting your account removes it.
- Companion Life is not directed to children and does not knowingly collect personal information from minors.
- We do not build profiles or sell your data to any third party.

## Contact

Support and privacy questions: _support email to be finalised with the store account before launch — placeholder: support@companionlife.app._

_This document is a draft for the store listing and will be reviewed in the privacy review before the beta._