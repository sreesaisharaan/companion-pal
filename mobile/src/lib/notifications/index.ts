import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { STAGE_META } from '@/lib/api/companion';
import { requireSupabase } from '@/lib/supabase';

/**
 * Local notifications — the gentle "remind" step of the daily loop.
 *
 * Delivery is device-local (expo-notifications): nothing is sent anywhere.
 * Everything here is a guarded no-op on web, where the Today screen is the
 * reminder. Preferences are device-local in AsyncStorage; task reminders also
 * record their intent in the `reminders` table (schema home for delivery
 * state, incl. the device notification id so it can be cancelled).
 *
 * Tone contract: reminders are supportive, never punitive — no streak-loss,
 * no guilt, no urgency. Permission is asked contextually (first task captured
 * with a due date, or toggling on in Profile), never on app launch, and a
 * refusal never blocks the app: the Today screen stays the reminder.
 */

const REMINDERS_ENABLED_KEY = 'reminders-enabled';

const WEEKLY_REVIEW_ENABLED_KEY = 'weekly-review-enabled';
const WEEKLY_REVIEW_WEEKDAY_KEY = 'weekly-review-weekday';
const WEEKLY_REVIEW_HOUR_KEY = 'weekly-review-hour';
const WEEKLY_REVIEW_MINUTE_KEY = 'weekly-review-minute';
const WEEKLY_REVIEW_NOTIFICATION_ID_KEY = 'weekly-review-notification-id';

const COMPANION_NUDGES_ENABLED_KEY = 'companion-nudges-enabled';
const COMPANION_NUDGE_NOTIFICATION_ID_KEY = 'companion-nudge-notification-id';
const COMPANION_NUDGE_LAST_SCHEDULED_KEY = 'companion-nudge-last-scheduled';

/** Android channel id — matches the `defaultChannel` declared in app.json. */
const CHANNEL_ID = 'reminders';

const DAY_MS = 86_400_000;

/** Local scheduled notifications are native-only (iOS/Android). */
export function remindersSupported(): boolean {
  return Platform.OS !== 'web';
}

async function readStorage(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeStorage(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Best-effort — preferences still apply for this run.
  }
}

async function removeStorage(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best-effort.
  }
}

/** Android 8+ requires a notification channel; create the default one up front. */
async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0B0B0B',
      sound: 'default',
    });
  } catch {
    // Best-effort — the app.json plugin also declares the default channel.
  }
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

/** Current OS-level permission state (native only; web reports "undetermined"). */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (!remindersSupported()) return 'undetermined';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/**
 * Ask for notification permission — the only place the system prompt is ever
 * shown. Called contextually (a first task captured with a due date, or a
 * toggle turned on in Profile), never on app launch, and never blocking: a
 * refusal just means the Today screen remains the reminder.
 */
export async function requestPermissions(): Promise<boolean> {
  if (!remindersSupported()) return false;
  try {
    await ensureNotificationChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (current.status === 'denied') return false;
    // Simulators can't meaningfully grant/display local notifications, so
    // don't raise a system dialog that can't be honored (expo-device check).
    if (!Device.isDevice) return false;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Task due-date reminders
// ---------------------------------------------------------------------------

/** Has the user opted into reminders? (device-local preference) */
export async function remindersEnabled(): Promise<boolean> {
  return (await readStorage(REMINDERS_ENABLED_KEY)) === 'on';
}

/** True once the user has ever made a reminder decision (on or off). */
async function remindersDecisionMade(): Promise<boolean> {
  return (await readStorage(REMINDERS_ENABLED_KEY)) !== null;
}

/**
 * Persist the opt-in preference. The preference is only stored as "on" once
 * notification permission is actually granted, so the stored flag and the
 * device's permission never drift apart. Returns false if permission was
 * refused.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    if (!remindersSupported()) return false;
    if (!(await requestPermissions())) return false;
  }
  await writeStorage(REMINDERS_ENABLED_KEY, enabled ? 'on' : 'off');
  return true;
}

/**
 * Reminder moment for a task: 09:00 local on its due date (a gentle morning
 * nudge), or null when the task has no due date.
 */
export function reminderDate(dueAt: string | null): Date | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  return new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9, 0, 0);
}

export type ScheduleReminderInput = {
  userId: string;
  taskId: string;
  taskTitle: string;
  dueAt: string | null;
};

/** Cancel (without marking delivered) any pending device notification for a task. */
async function cancelScheduledForTask(userId: string, taskId: string): Promise<void> {
  try {
    const db = requireSupabase();
    const { data } = await db
      .from('reminders')
      .select('device_notification_id')
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .not('device_notification_id', 'is', null);
    for (const row of data ?? []) {
      if (row.device_notification_id) {
        try {
          await Notifications.cancelScheduledNotificationAsync(row.device_notification_id);
        } catch {
          // Already fired or no longer scheduled — nothing to cancel.
        }
      }
    }
  } catch {
    // Best-effort; a duplicate reminder is harmless.
  }
}

/**
 * Schedule a local notification for a task's reminder moment and record the
 * intent in the `reminders` table. Silent on failure — the check-in UI is the
 * fallback reminder, and the user's flow must never block on notifications.
 *
 * If the user has never made a reminder decision, capturing a task with a due
 * date is the contextual moment to ask for permission; a refusal just means
 * the Today screen stays the reminder. If reminders are already scheduled for
 * the task (re-capture or a due-date edit), the old notification is replaced.
 */
export async function scheduleTaskReminder({
  userId,
  taskId,
  taskTitle,
  dueAt,
}: ScheduleReminderInput): Promise<void> {
  if (!remindersSupported()) return;
  await ensureNotificationChannel();

  let enabled = await remindersEnabled();
  if (!enabled && !(await remindersDecisionMade())) {
    const granted = await requestPermissions();
    if (!granted) return;
    if (await setRemindersEnabled(true)) enabled = true;
  }
  if (!enabled) return;

  let fireAt = reminderDate(dueAt);
  if (!fireAt) return;
  // The nudge is 9:00 AM on the due date. If that moment has already passed
  // (e.g. a "Today" task captured after 9 AM), roll forward to the next
  // morning's nudge instead of never reminding. setDate keeps 9:00 AM local
  // across DST; the guard bounds the loop against pathological input.
  let guard = 0;
  while (fireAt.getTime() <= Date.now() && guard < 370) {
    fireAt.setDate(fireAt.getDate() + 1);
    guard += 1;
  }

  await cancelScheduledForTask(userId, taskId);

  let notificationId: string | null = null;
  try {
    notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Companion Life',
        body: `Reminder: “${taskTitle}” is on your list today.`,
        sound: 'default',
        data: { screen: 'today', taskId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Scheduling failed (e.g. simulator without notification support); the
    // intent is still recorded below so the reminders table stays truthful.
  }

  try {
    const db = requireSupabase();
    await db.from('reminders').insert({
      user_id: userId,
      task_id: taskId,
      scheduled_for: fireAt.toISOString(),
      device_notification_id: notificationId ?? null,
    });
  } catch {
    // Recording is best-effort — never surface a notification error in the UI.
  }
}

/**
 * Cancel a task's scheduled notification (if any) and mark its reminder rows
 * delivered + acknowledged — a completed task stops reminding. A future
 * task-delete or due-date-edit flow should call this before removing/updating
 * the row; scheduleTaskReminder already replaces pending notifications when
 * re-scheduling the same task.
 */
export async function cancelTaskReminder(userId: string, taskId: string): Promise<void> {
  if (!remindersSupported()) return;
  await cancelScheduledForTask(userId, taskId);
  try {
    const db = requireSupabase();
    await db
      .from('reminders')
      .update({
        delivered_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .is('delivered_at', null);
  } catch {
    // Best-effort; a stray reminder on a completed task is harmless.
  }
}

/**
 * Cancel every pending device notification and mark the rows delivered +
 * acknowledged — used when the user turns task reminders off.
 */
export async function cancelAllReminders(userId: string): Promise<void> {
  if (!remindersSupported()) return;
  try {
    const db = requireSupabase();
    const { data } = await db
      .from('reminders')
      .select('device_notification_id')
      .eq('user_id', userId)
      .is('delivered_at', null)
      .not('device_notification_id', 'is', null);
    for (const row of data ?? []) {
      if (row.device_notification_id) {
        try {
          await Notifications.cancelScheduledNotificationAsync(row.device_notification_id);
        } catch {
          // Already fired or no longer scheduled.
        }
      }
    }
    await db
      .from('reminders')
      .update({
        delivered_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .is('delivered_at', null);
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Weekly review reminder
// ---------------------------------------------------------------------------

export type WeeklyReviewPrefs = {
  enabled: boolean;
  /** expo-notifications weekday: 1 = Sunday … 7 = Saturday. */
  weekday: number;
  hour: number;
  minute: number;
};

/** Default: Sunday evening. Weekdays follow the trigger convention (1 = Sunday). */
export const DEFAULT_WEEKLY_REVIEW: WeeklyReviewPrefs = {
  enabled: false,
  weekday: 1,
  hour: 18,
  minute: 0,
};

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function weeklyReviewPrefs(): Promise<WeeklyReviewPrefs> {
  const [enabled, weekday, hour, minute] = await Promise.all([
    readStorage(WEEKLY_REVIEW_ENABLED_KEY),
    readStorage(WEEKLY_REVIEW_WEEKDAY_KEY),
    readStorage(WEEKLY_REVIEW_HOUR_KEY),
    readStorage(WEEKLY_REVIEW_MINUTE_KEY),
  ]);
  return {
    enabled: enabled === 'on',
    weekday: clampInt(weekday, DEFAULT_WEEKLY_REVIEW.weekday, 1, 7),
    hour: clampInt(hour, DEFAULT_WEEKLY_REVIEW.hour, 0, 23),
    minute: clampInt(minute, DEFAULT_WEEKLY_REVIEW.minute, 0, 59),
  };
}

/**
 * Persist weekly-review preferences and (re)schedule the notification to
 * match. Turning it on asks permission contextually; turning it off cancels
 * the pending notification. Returns false when permission was refused.
 */
export async function setWeeklyReviewPrefs(
  partial: Partial<WeeklyReviewPrefs>,
): Promise<boolean> {
  const prefs = { ...(await weeklyReviewPrefs()), ...partial };
  if (prefs.enabled) {
    if (!remindersSupported()) return false;
    if (!(await requestPermissions())) return false;
  }
  await Promise.all([
    writeStorage(WEEKLY_REVIEW_ENABLED_KEY, prefs.enabled ? 'on' : 'off'),
    writeStorage(WEEKLY_REVIEW_WEEKDAY_KEY, String(prefs.weekday)),
    writeStorage(WEEKLY_REVIEW_HOUR_KEY, String(prefs.hour)),
    writeStorage(WEEKLY_REVIEW_MINUTE_KEY, String(prefs.minute)),
  ]);
  if (prefs.enabled) {
    await scheduleWeeklyReview();
  } else {
    await cancelWeeklyReview();
  }
  return true;
}

/**
 * Schedule (or reschedule) the weekly review notification — a repeating
 * weekly trigger at the configured day/time. No-op unless enabled.
 */
export async function scheduleWeeklyReview(): Promise<void> {
  if (!remindersSupported()) return;
  const prefs = await weeklyReviewPrefs();
  if (!prefs.enabled) return;
  await ensureNotificationChannel();
  if (!(await requestPermissions())) return;

  const previousId = await readStorage(WEEKLY_REVIEW_NOTIFICATION_ID_KEY);
  if (previousId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(previousId);
    } catch {
      // Already fired or missing — nothing to cancel.
    }
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Companion Life',
        body: 'Your weekly review is ready — a gentle look back at the week (+15 XP). No pressure.',
        sound: 'default',
        data: { screen: 'plan' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: prefs.weekday,
        hour: prefs.hour,
        minute: prefs.minute,
        channelId: CHANNEL_ID,
      },
    });
    await writeStorage(WEEKLY_REVIEW_NOTIFICATION_ID_KEY, id);
  } catch {
    // Scheduling failed (simulator etc.) — the Plan tab remains the reminder.
  }
}

/** Cancel the notification whose id is stored under `key` (if any). */
async function cancelStoredNotification(key: string): Promise<void> {
  const id = await readStorage(key);
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or missing.
  }
  await removeStorage(key);
}

export async function cancelWeeklyReview(): Promise<void> {
  await cancelStoredNotification(WEEKLY_REVIEW_NOTIFICATION_ID_KEY);
}

// ---------------------------------------------------------------------------
// Companion check-in nudges (soft, opt-in, off by default)
// ---------------------------------------------------------------------------

/** Has the user opted into companion check-ins? (off by default) */
export async function companionNudgesEnabled(): Promise<boolean> {
  return (await readStorage(COMPANION_NUDGES_ENABLED_KEY)) === 'on';
}

/**
 * Persist the companion-nudge preference. Turning on schedules the first
 * nudge from now (so it only fires after a quiet stretch); turning off
 * cancels any pending nudge. Returns false when permission was refused.
 */
export async function setCompanionNudgesEnabled(
  enabled: boolean,
  userId?: string,
): Promise<boolean> {
  if (enabled) {
    if (!remindersSupported()) return false;
    if (!(await requestPermissions())) return false;
  }
  await writeStorage(COMPANION_NUDGES_ENABLED_KEY, enabled ? 'on' : 'off');
  if (enabled) {
    await scheduleCompanionNudge(userId);
  } else {
    await cancelCompanionNudge();
  }
  return true;
}

/**
 * (Re)arm the gentle companion check-in: one notification 3 days from now at
 * 9 AM — the moment the app has been quiet for 3+ days. Called whenever the
 * user opens the app or completes a task, so active users never see it and a
 * genuinely quiet stretch gets exactly one nudge. Rate-limited to one per
 * week, and skipped entirely when Companion rewards are off (quiet_mode).
 */
export async function scheduleCompanionNudge(userId: string | undefined): Promise<void> {
  if (!remindersSupported()) return;
  if (!(await companionNudgesEnabled())) return;
  await ensureNotificationChannel();
  if (!(await requestPermissions())) return;

  // Rate limit first — this runs on every app foreground, so the cheap
  // storage check precedes the network round-trip below.
  const lastScheduled = await readStorage(COMPANION_NUDGE_LAST_SCHEDULED_KEY);
  if (lastScheduled && Date.now() - new Date(lastScheduled).getTime() < 7 * DAY_MS) return;

  // Respect the "Companion rewards" toggle (companions.quiet_mode): rewards
  // off means no nudges at all. The companion's stage personalizes the tone.
  let quietMode = true;
  let stage: string | null = null;
  if (userId) {
    try {
      const db = requireSupabase();
      const { data } = await db
        .from('companions')
        .select('quiet_mode, stage')
        .eq('user_id', userId)
        .maybeSingle();
      quietMode = data?.quiet_mode ?? true;
      stage = data?.stage ?? null;
    } catch {
      // Unknown reward state — be gentle and skip rather than nudge wrongly.
    }
  }
  if (quietMode) return;

  const fireAt = new Date();
  fireAt.setDate(fireAt.getDate() + 3);
  fireAt.setHours(9, 0, 0, 0);

  const previousId = await readStorage(COMPANION_NUDGE_NOTIFICATION_ID_KEY);
  if (previousId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(previousId);
    } catch {
      // Already fired or missing.
    }
  }

  const meta =
    stage && stage in STAGE_META ? STAGE_META[stage as keyof typeof STAGE_META] : STAGE_META.hatchling;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Companion Life',
        body: `${meta.blurb} Your companion is here whenever you're ready. No pressure, no penalties.`,
        sound: 'default',
        data: { screen: 'today' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: CHANNEL_ID,
      },
    });
    await writeStorage(COMPANION_NUDGE_NOTIFICATION_ID_KEY, id);
    await writeStorage(COMPANION_NUDGE_LAST_SCHEDULED_KEY, new Date().toISOString());
  } catch {
    // Scheduling failed (simulator etc.) — skip the nudge quietly.
  }
}

export async function cancelCompanionNudge(): Promise<void> {
  await cancelStoredNotification(COMPANION_NUDGE_NOTIFICATION_ID_KEY);
  // A disabled nudge shouldn't count toward the weekly cap: re-enabling is a
  // fresh opt-in that re-arms the gentle check-in from now.
  await removeStorage(COMPANION_NUDGE_LAST_SCHEDULED_KEY);
}

// ---------------------------------------------------------------------------
// Deep linking from a tapped notification
// ---------------------------------------------------------------------------

/**
 * Route for a tapped notification. Task reminders and companion nudges land
 * on the Today screen; the weekly review opens the Plan tab where its card
 * lives. `taskId` rides along in the payload for a future task detail screen,
 * but Today is the destination for now.
 */
export function notificationDeepLink(
  response: Notifications.NotificationResponse,
): '/' | '/plan' {
  const screen = response.notification.request.content.data?.screen;
  return screen === 'plan' ? '/plan' : '/';
}
