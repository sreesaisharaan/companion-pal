import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';

import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CTAButton } from '@/components/ui/cta-button';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import {
  AUTO_CURRENCY,
  CURRENCY_OPTIONS,
  currencySymbol,
  useCurrency,
} from '@/hooks/use-currency';
import { APPEARANCE_OPTIONS, setAppearancePreference, useAppearance } from '@/hooks/use-appearance';
import { useTheme } from '@/hooks/use-theme';
import { AUTO_TIMEZONE, TIMEZONE_OPTIONS, useTimezone } from '@/hooks/use-timezone';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_COMPANION, STAGE_META, useCompanion, useSetCompanionQuietMode } from '@/lib/api/companion';
import { timeZoneAbbreviation } from '@/lib/datetime';
import {
  cancelAllReminders,
  cancelCompanionNudge,
  companionNudgesEnabled,
  getPermissionStatus,
  remindersEnabled,
  remindersSupported,
  scheduleCompanionNudge,
  setCompanionNudgesEnabled,
  setRemindersEnabled,
  setWeeklyReviewPrefs,
  weeklyReviewPrefs,
  type PermissionStatus,
} from '@/lib/notifications';
import { requireSupabase } from '@/lib/supabase';

/** Tables to export; each is scoped to the owner by RLS. */
const EXPORT_TABLES = [
  'profiles',
  'budget_categories',
  'transactions',
  'tasks',
  'xp_events',
  'companions',
] as const;

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type WeekdayValue = '1' | '2' | '3' | '4' | '5' | '6' | '7';

/** expo-notifications weekday convention: 1 = Sunday … 7 = Saturday. */
const WEEKDAYS: { value: WeekdayValue; label: string }[] = [
  { value: '1', label: 'Sun' },
  { value: '2', label: 'Mon' },
  { value: '3', label: 'Tue' },
  { value: '4', label: 'Wed' },
  { value: '5', label: 'Thu' },
  { value: '6', label: 'Fri' },
  { value: '7', label: 'Sat' },
];

type TimeValue = '9am' | '12pm' | '6pm' | '9pm';

const WEEKLY_TIMES: { value: TimeValue; label: string }[] = [
  { value: '9am', label: '9:00 AM' },
  { value: '12pm', label: '12:00 PM' },
  { value: '6pm', label: '6:00 PM' },
  { value: '9pm', label: '9:00 PM' },
];

function hourToTimeValue(hour: number): TimeValue {
  if (hour === 9) return '9am';
  if (hour === 12) return '12pm';
  if (hour === 21) return '9pm';
  return '6pm';
}

function timeValueToHour(value: TimeValue): number {
  if (value === '9am') return 9;
  if (value === '12pm') return 12;
  if (value === '9pm') return 21;
  return 18;
}

/** A labelled On/Off row for the notification toggles (monochrome pill button). */
function ToggleRow({
  label,
  sub,
  on,
  onToggle,
  busy,
}: {
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefCopy}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sub}
        </ThemedText>
      </View>
      <Button
        label={on ? 'On' : 'Off'}
        variant={on ? 'primary' : 'secondary'}
        onPress={onToggle}
        loading={busy}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const email = session?.user?.email ?? '—';
  const userId = session?.user?.id;
  const theme = useTheme();
  const appearance = useAppearance();
  const {
    currency,
    isAuto,
    deviceCurrency,
    isLoading: currencyLoading,
    setPreference,
  } = useCurrency();
  const {
    timeZone,
    isAuto: timezoneIsAuto,
    deviceTimeZone,
    engineHonoursTimeZone,
    setPreference: setTimezonePreference,
    isLoading: timezoneLoading,
  } = useTimezone();

  const companion = useCompanion(userId);
  const setQuietMode = useSetCompanionQuietMode(userId);
  const rewardsOn = !(companion.data?.quiet_mode ?? false);

  const [exporting, setExporting] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [weeklyOn, setWeeklyOn] = useState<boolean | null>(null);
  const [weeklyWeekday, setWeeklyWeekday] = useState<WeekdayValue>('1');
  const [weeklyTime, setWeeklyTime] = useState<TimeValue>('6pm');
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [nudgesOn, setNudgesOn] = useState<boolean | null>(null);
  const [nudgesBusy, setNudgesBusy] = useState(false);
  const [permission, setPermission] = useState<PermissionStatus>('undetermined');
  const [notificationsMessage, setNotificationsMessage] = useState<string | null>(null);

  // Currency picker sheet
  const [currencySheetOpen, setCurrencySheetOpen] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  // Timezone picker sheet
  const [timezoneSheetOpen, setTimezoneSheetOpen] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [reminders, weekly, nudges, permissionState] = await Promise.all([
        remindersEnabled(),
        weeklyReviewPrefs(),
        companionNudgesEnabled(),
        getPermissionStatus(),
      ]);
      if (cancelled) return;
      setRemindersOn(reminders);
      setWeeklyOn(weekly.enabled);
      setWeeklyWeekday(String(weekly.weekday) as WeekdayValue);
      setWeeklyTime(hourToTimeValue(weekly.hour));
      setNudgesOn(nudges);
      setPermission(permissionState);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-check OS permission when the app returns to the foreground — the user
  // may have just enabled notifications in system settings after seeing the
  // "blocked" card, and the toggles should appear without a restart.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermissionStatus().then(setPermission);
    });
    return () => subscription.remove();
  }, []);

  async function toggleTaskReminders() {
    if (!userId || remindersBusy) return;
    setRemindersBusy(true);
    setNotificationsMessage(null);
    try {
      const next = !remindersOn;
      if (!next) {
        // Turning off: stop future scheduling and cancel everything pending.
        await setRemindersEnabled(false);
        void cancelAllReminders(userId);
        setRemindersOn(false);
        setNotificationsMessage('Task reminders are off. The Today screen is always your reminder.');
      } else {
        const granted = await setRemindersEnabled(true);
        if (granted) {
          setRemindersOn(true);
          setPermission('granted');
          setNotificationsMessage(
            'On. Due tasks get a gentle reminder at 9:00 AM on their due date — or the next morning if that has passed — cancelled the moment you complete them.',
          );
        } else {
          setRemindersOn(false);
          setPermission(await getPermissionStatus());
        }
      }
    } finally {
      setRemindersBusy(false);
    }
  }

  async function toggleWeeklyReview() {
    if (weeklyBusy) return;
    setWeeklyBusy(true);
    setNotificationsMessage(null);
    try {
      const next = !weeklyOn;
      const ok = await setWeeklyReviewPrefs({
        enabled: next,
        weekday: Number(weeklyWeekday),
        hour: timeValueToHour(weeklyTime),
        minute: 0,
      });
      if (ok) {
        setWeeklyOn(next);
        setPermission('granted');
        setNotificationsMessage(
          next
            ? 'On. A gentle nudge on the day and time you picked — +15 XP when you close the week.'
            : 'Weekly review nudge is off.',
        );
      } else {
        setPermission(await getPermissionStatus());
      }
    } finally {
      setWeeklyBusy(false);
    }
  }

  function changeWeekly(weekday: WeekdayValue, time: TimeValue) {
    setWeeklyWeekday(weekday);
    setWeeklyTime(time);
    if (!weeklyOn) return;
    // Live reschedule while the toggle is on.
    setWeeklyBusy(true);
    void setWeeklyReviewPrefs({
      enabled: true,
      weekday: Number(weekday),
      hour: timeValueToHour(time),
      minute: 0,
    }).finally(() => setWeeklyBusy(false));
  }

  async function toggleNudges() {
    if (!userId || nudgesBusy) return;
    setNudgesBusy(true);
    setNotificationsMessage(null);
    try {
      const next = !nudgesOn;
      const ok = await setCompanionNudgesEnabled(next, userId);
      if (ok) {
        setNudgesOn(next);
        setPermission('granted');
        setNotificationsMessage(
          next
            ? rewardsOn
              ? 'On. After a few quiet days, your companion may check in — at most once a week, no pressure.'
              : 'On, but paused — Companion rewards are off, so no check-ins will be sent.'
            : 'Companion check-ins are off.',
        );
      } else {
        setPermission(await getPermissionStatus());
      }
    } finally {
      setNudgesBusy(false);
    }
  }

  function toggleRewards() {
    if (setQuietMode.isPending) return;
    const turningOff = rewardsOn;
    setQuietMode.mutate(turningOff, {
      onSuccess: () => {
        if (turningOff) {
          // Rewards off pauses companion check-ins too.
          void cancelCompanionNudge();
        } else {
          // Rewards back on re-arms the gentle check-in cycle.
          void scheduleCompanionNudge(userId);
        }
      },
    });
  }

  async function exportData() {
    if (!userId) return;
    setExporting(true);
    setDataError(null);
    setDataMessage(null);
    try {
      const db = requireSupabase();
      const out: Record<string, unknown[]> = {};
      let total = 0;
      for (const table of EXPORT_TABLES) {
        const key = table === 'profiles' ? 'id' : 'user_id';
        const { data, error } = await db.from(table).select('*').eq(key, userId);
        if (error) throw error;
        out[table] = data ?? [];
        total += (data ?? []).length;
      }
      const stamped = { exported_at: new Date().toISOString(), email, data: out };
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        downloadJson(`companion-life-export-${new Date().toISOString().slice(0, 10)}.json`, stamped);
        setDataMessage(`Downloaded your data — ${total} rows across ${EXPORT_TABLES.length} tables.`);
      } else {
        await Share.share({ title: 'Companion Life data export', message: JSON.stringify(stamped) });
        setDataMessage('Opened the share sheet with your data.');
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not export your data.');
    } finally {
      setExporting(false);
    }
  }

  function armDelete() {
    setConfirmDelete(true);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = setTimeout(() => setConfirmDelete(false), 4000);
  }

  async function deleteAccount() {
    setDeleting(true);
    setDataError(null);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    try {
      const db = requireSupabase();
      const { error } = await db.functions.invoke('delete-account', {});
      if (error) throw error;
      await signOut();
      router.replace('/sign-in');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not delete your account.');
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  function pickCurrency(preference: string) {
    if (setPreference.isPending) return;
    setCurrencyError(null);
    // Keep the sheet open until the upsert succeeds so a failure is visible.
    setPreference.mutate(preference, {
      onSuccess: () => setCurrencySheetOpen(false),
      onError: (error) =>
        setCurrencyError(error instanceof Error ? error.message : 'Could not save the currency.'),
    });
  }

  function pickTimezone(preference: string) {
    if (setTimezonePreference.isPending) return;
    setTimezoneError(null);
    // Keep the sheet open until the upsert succeeds so a failure is visible.
    setTimezonePreference.mutate(preference, {
      onSuccess: () => setTimezoneSheetOpen(false),
      onError: (error) =>
        setTimezoneError(error instanceof Error ? error.message : 'Could not save the timezone.'),
    });
  }

  const currencyValue = isAuto
    ? `Auto (device) · ${currency}`
    : `${currency} · ${currencySymbol(currency)}`;

  const timezoneValue = timezoneIsAuto
    ? `Auto (device) · ${deviceTimeZone}`
    : `${timeZone} · ${timeZoneAbbreviation(timeZone)}`;

  return (
    <Screen tabBar paddedTop>
      <ScreenHeader
        eyebrow="Companion Life"
        title="Profile"
        subtitle="Your settings, your data, your pace."
        image={STAGE_META[(companion.data ?? DEFAULT_COMPANION).stage].image}
      />

      {/* Account — the ONE light hero card on this screen */}
      <Card variant="primary" elevated>
        <ThemedView type="backgroundSelected" style={styles.avatar}>
          <ThemedText type="smallBold">{(email[0] ?? '?').toUpperCase()}</ThemedText>
        </ThemedView>
        <ThemedText type="smallBold">{email}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Signed in via Supabase. Your currency and timezone preferences sync to your profile.
        </ThemedText>
      </Card>

      <SectionTitle>Preferences</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <View style={styles.prefRow}>
          <View style={styles.prefCopy}>
            <ThemedText type="small">Appearance</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Dark mode for low-light evenings — or follow your device.
            </ThemedText>
          </View>
        </View>
        <SegmentedControl
          options={APPEARANCE_OPTIONS}
          value={appearance}
          onChange={(value) => value && setAppearancePreference(value)}
        />

        <Pressable
          onPress={() => setTimezoneSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Change timezone, currently ${timezoneValue}`}
          style={({ pressed }) => [styles.prefRow, pressed && styles.pressed]}>
          <View style={styles.prefCopy}>
            <ThemedText type="small">Timezone</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {timezoneLoading ? '…' : timezoneValue}
            </ThemedText>
          </View>
          <IconButton icon="›" variant="outlined" size={32} />
        </Pressable>
        <Pressable
          onPress={() => setCurrencySheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Change currency, currently ${currencyValue}`}
          style={({ pressed }) => [styles.prefRow, pressed && styles.pressed]}>
          <View style={styles.prefCopy}>
            <ThemedText type="small">Currency</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {currencyLoading ? '…' : currencyValue}
            </ThemedText>
          </View>
          <IconButton icon="›" variant="outlined" size={32} />
        </Pressable>
        <View style={styles.prefRow}>
          <View style={styles.prefCopy}>
            <ThemedText type="small">Companion rewards</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              XP and gentle check-ins. Turning off pauses them too.
            </ThemedText>
          </View>
          <Button
            label={rewardsOn ? 'On' : 'Off'}
            variant={rewardsOn ? 'primary' : 'secondary'}
            onPress={toggleRewards}
            loading={setQuietMode.isPending}
          />
        </View>
      </Card>

      <SectionTitle>Notifications</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        {!remindersSupported() ? (
          <ThemedText type="small" themeColor="textSecondary">
            Local notifications need iOS or Android. In the browser, the Today screen is your
            reminder.
          </ThemedText>
        ) : permission === 'denied' ? (
          <>
            <ThemedText type="smallBold">Notifications are blocked at the system level</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Enable notifications for Companion Life in your device settings, then return here to
              turn on reminders. Until then, the Today screen is your reminder.
            </ThemedText>
            <Button
              label="Open device settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
              fullWidth
            />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Gentle, on-device reminders — nothing is sent anywhere. Completing a task cancels its
              reminder, and the Today screen is always your reminder.
            </ThemedText>

            <ToggleRow
              label="Task reminders"
              sub="A gentle note at 9:00 AM on a task's due date — or the next morning if that's already passed."
              on={remindersOn ?? false}
              onToggle={toggleTaskReminders}
              busy={remindersBusy}
            />

            <ToggleRow
              label="Weekly review"
              sub="A soft nudge to close the week and earn +15 XP."
              on={weeklyOn ?? false}
              onToggle={toggleWeeklyReview}
              busy={weeklyBusy}
            />
            {weeklyOn ? (
              <View style={styles.weeklyPicker}>
                <ThemedText type="small" themeColor="textSecondary">
                  Day · Time
                </ThemedText>
                <SegmentedControl
                  options={WEEKDAYS}
                  value={weeklyWeekday}
                  onChange={(value) => value && changeWeekly(value, weeklyTime)}
                  wrap
                />
                <SegmentedControl
                  options={WEEKLY_TIMES}
                  value={weeklyTime}
                  onChange={(value) => value && changeWeekly(weeklyWeekday, value)}
                  wrap
                />
              </View>
            ) : null}

            <ToggleRow
              label="Companion check-ins"
              sub="After a few quiet days, one gentle note from your companion — at most one per week. No pressure, no penalties."
              on={nudgesOn ?? false}
              onToggle={toggleNudges}
              busy={nudgesBusy}
            />
            {!rewardsOn ? (
              <ThemedText type="small" themeColor="textSecondary">
                Companion rewards are off, so check-ins are paused — they resume when you turn
                rewards back on.
              </ThemedText>
            ) : null}

            {notificationsMessage ? (
              <ThemedText type="small" themeColor="textSecondary">
                {notificationsMessage}
              </ThemedText>
            ) : null}
          </>
        )}
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <ThemedText type="small" themeColor="textSecondary">
          Your data is yours. Export a full JSON copy at any time, or delete the account and every
          row with it — permanently.
        </ThemedText>
        <CTAButton label="Export my data" onPress={exportData} loading={exporting} fullWidth />
        {confirmDelete ? (
          <CTAButton
            label="Tap again to permanently delete your account"
            onPress={deleteAccount}
            loading={deleting}
            fullWidth
          />
        ) : (
          <Button label="Delete my account" variant="ghost" onPress={armDelete} fullWidth />
        )}
        {dataMessage ? (
          <ThemedText type="small" themeColor="textSecondary">
            {dataMessage}
          </ThemedText>
        ) : null}
        {dataError ? <ThemedText type="smallBold">{dataError}</ThemedText> : null}
      </Card>

      <Button label="Sign out" variant="secondary" onPress={() => signOut()} fullWidth />

      {/* Currency picker bottom sheet */}
      <Modal
        visible={currencySheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCurrencySheetOpen(false)}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCurrencySheetOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                Currency
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={() => setCurrencySheetOpen(false)} accessibilityLabel="Close" />
            </View>
            <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <ThemedText type="small" themeColor="textSecondary">
                Follow the device currency, or lock one in for every amount you see.
              </ThemedText>
              {currencyError ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {currencyError}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={() => pickCurrency(AUTO_CURRENCY)}
                disabled={setPreference.isPending}
                accessibilityRole="button"
                accessibilityLabel="Follow device currency"
                style={({ pressed }) => [styles.currencyRow, pressed && styles.pressed]}>
                <View style={styles.prefCopy}>
                  <ThemedText type="smallBold">Auto (device)</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {deviceCurrency} · {currencySymbol(deviceCurrency)}
                  </ThemedText>
                </View>
                {isAuto ? <Chip label="Current" selected /> : null}
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {CURRENCY_OPTIONS.map((option) => {
                const active = !isAuto && currency === option.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => pickCurrency(option.code)}
                    disabled={setPreference.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${option.label}`}
                    style={({ pressed }) => [styles.currencyRow, pressed && styles.pressed]}>
                    <View style={styles.prefCopy}>
                      <ThemedText type="smallBold">{option.code}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {option.label}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {currencySymbol(option.code)}
                    </ThemedText>
                    {active ? <Chip label="Current" selected /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Timezone picker bottom sheet */}
      <Modal
        visible={timezoneSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTimezoneSheetOpen(false)}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTimezoneSheetOpen(false)}
            accessibilityLabel="Close"
          />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                Timezone
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={() => setTimezoneSheetOpen(false)} accessibilityLabel="Close" />
            </View>
            <ScrollView style={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <ThemedText type="small" themeColor="textSecondary">
                Follow the device timezone, or lock one in — every due date, review time, and nudge
                adjusts to match.
              </ThemedText>
              {!engineHonoursTimeZone ? (
                <ThemedText type="small" themeColor="textSecondary">
                  This device can&apos;t honour a manual timezone right now, so only Auto is available.
                </ThemedText>
              ) : null}
              {timezoneError ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {timezoneError}
                </ThemedText>
              ) : null}

              <Pressable
                onPress={() => pickTimezone(AUTO_TIMEZONE)}
                disabled={setTimezonePreference.isPending}
                accessibilityRole="button"
                accessibilityLabel="Follow device timezone"
                style={({ pressed }) => [styles.currencyRow, pressed && styles.pressed]}>
                <View style={styles.prefCopy}>
                  <ThemedText type="smallBold">Auto (device)</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {deviceTimeZone}
                  </ThemedText>
                </View>
                {timezoneIsAuto ? <Chip label="Current" selected /> : null}
              </Pressable>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              {TIMEZONE_OPTIONS.map((option) => {
                const active =
                  engineHonoursTimeZone && !timezoneIsAuto && timeZone === option.id;
                const unavailable = !engineHonoursTimeZone;
                const abbreviation = timeZoneAbbreviation(option.id);
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => pickTimezone(option.id)}
                    disabled={setTimezonePreference.isPending || unavailable}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${option.label}`}
                    style={({ pressed }) => [
                      styles.currencyRow,
                      pressed && styles.pressed,
                      unavailable && styles.disabled,
                    ]}>
                    <View style={styles.prefCopy}>
                      <ThemedText type="smallBold">{option.id}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {option.label}
                      </ThemedText>
                    </View>
                    {abbreviation ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        {abbreviation}
                      </ThemedText>
                    ) : null}
                    {active ? <Chip label="Current" selected /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  prefCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  weeklyPicker: {
    gap: Spacing.two,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
  },
  sheetBody: {
    flexGrow: 0,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  disabled: {
    opacity: 0.4,
  },
});
