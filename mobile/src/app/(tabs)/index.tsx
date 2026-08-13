import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { formatDueLabel, TaskRow } from '@/components/task-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CTAButton } from '@/components/ui/cta-button';
import { IconButton } from '@/components/ui/icon-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCurrency, currencySymbol } from '@/hooks/use-currency';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_COMPANION,
  nextStage,
  stageProgress,
  STAGE_META,
  useCompanion,
} from '@/lib/api/companion';
import { useMonthTotal } from '@/lib/api/money';
import { cancelTaskReminder, scheduleCompanionNudge, scheduleTaskReminder } from '@/lib/notifications';
import {
  awardTaskXp,
  endOfToday,
  spawnNextOccurrence,
  startOfToday,
  todayTasksKey,
  upcomingTasksKey,
  type Task,
  useCompleteTask,
  useCompletedToday,
  useCreateTask,
  useDeleteTask,
  useTodayTasks,
  useUncompleteTask,
  useUpdateTask,
  useUpcomingTasks,
} from '@/lib/api/tasks';
import { useAuth } from '@/lib/auth-context';

type DueChoice = 'none' | 'today' | 'tomorrow';

const DUE_CHOICES: { value: DueChoice; label: string }[] = [
  { value: 'none', label: 'No time' },
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
];

type RepeatChoice = 'none' | 'daily' | 'weekly' | 'monthly';

const REPEAT_CHOICES: { value: RepeatChoice; label: string }[] = [
  { value: 'none', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function dueAtForChoice(choice: DueChoice): string | null {
  if (choice === 'none') return null;
  const base = endOfToday();
  if (choice === 'tomorrow') base.setDate(base.getDate() + 1);
  return base.toISOString();
}

/**
 * Which capture-style due chip matches a task's current due date? Null means
 * the date is outside today/tomorrow (e.g. a distant recurring occurrence) —
 * the edit sheet then keeps it unless the user picks a chip.
 */
function dueChoiceForDueAt(dueAt: string | null): DueChoice | null {
  if (!dueAt) return 'none';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const dayDiff = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      startOfToday().getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'tomorrow';
  return null;
}

/** Same calendar day (ignores the time-of-day, so re-picking "Today" is a no-op). */
function sameDueDay(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export default function TodayScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const theme = useTheme();
  const { formatCurrency, currency } = useCurrency();
  const queryClient = useQueryClient();

  const todayTasks = useTodayTasks(userId);
  const upcomingTasks = useUpcomingTasks(userId);
  const completedToday = useCompletedToday(userId);
  const companion = useCompanion(userId);
  const monthTotal = useMonthTotal(userId);
  const createTask = useCreateTask(userId);
  const completeTask = useCompleteTask();
  const uncompleteTask = useUncompleteTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [title, setTitle] = useState('');
  const [due, setDue] = useState<DueChoice>('none');
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [captureError, setCaptureError] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState<DueChoice | null>('none');
  const [editRepeat, setEditRepeat] = useState<RepeatChoice>('none');
  const [editError, setEditError] = useState<string | null>(null);

  const companionData = companion.data ?? DEFAULT_COMPANION;
  const progress = stageProgress(companionData);
  const next = nextStage(companionData);
  const stageMeta = STAGE_META[companionData.stage];

  const emailName = (session?.user?.email ?? '').split('@')[0];
  const firstName = emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1) : 'friend';
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  function submitCapture() {
    if (!title.trim()) {
      setCaptureError('Give your task a name first.');
      return;
    }
    setCaptureError(null);
    createTask.mutate(
      { title, dueAt: dueAtForChoice(due), recurrence: repeat === 'none' ? null : repeat },
      {
        onSuccess: (task) => {
          setTitle('');
          setDue('none');
          setRepeat('none');
          // The remind step: a due task schedules a gentle local notification
          // (native only; web is a no-op). Never blocks the capture flow.
          if (userId && task.due_at) {
            void scheduleTaskReminder({
              userId,
              taskId: task.id,
              taskTitle: task.title,
              dueAt: task.due_at,
            });
          }
        },
        onError: (error) => setCaptureError(error.message || 'Could not save the task.'),
      },
    );
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDue(dueChoiceForDueAt(task.due_at));
    setEditRepeat(
      task.recurrence === 'daily' || task.recurrence === 'weekly' || task.recurrence === 'monthly'
        ? task.recurrence
        : 'none',
    );
    setEditError(null);
  }

  function closeEditModal() {
    if (updateTask.isPending) return;
    setEditingTask(null);
  }

  function saveEdit() {
    const task = editingTask;
    if (!task) return;
    if (!editTitle.trim()) {
      setEditError('Give your task a name first.');
      return;
    }
    setEditError(null);
    const newDueAt = editDue === null ? task.due_at : dueAtForChoice(editDue);
    const newRecurrence = editRepeat === 'none' ? null : editRepeat;
    updateTask.mutate(
      { taskId: task.id, title: editTitle, dueAt: newDueAt, recurrence: newRecurrence },
      {
        onSuccess: (updated) => {
          setEditingTask(null);
          if (!userId) return;
          // Keep the reminder truthful: removing the due date cancels it;
          // changing the due date or title reschedules (scheduleTaskReminder
          // replaces any pending notification for the task). Re-picking the
          // same day is a no-op.
          if (!newDueAt) {
            if (task.due_at) void cancelTaskReminder(userId, task.id);
          } else if (!sameDueDay(newDueAt, task.due_at) || updated.title !== task.title) {
            void scheduleTaskReminder({
              userId,
              taskId: task.id,
              taskTitle: updated.title,
              dueAt: newDueAt,
            });
          }
        },
        onError: (error) => setEditError(error.message || 'Could not save the task.'),
      },
    );
  }

  async function removeTask(task: Task) {
    // Cancel the reminder BEFORE the delete: reminder rows cascade away with
    // the task row, so the device notification id would be unreachable after.
    if (userId) await cancelTaskReminder(userId, task.id);
    deleteTask.mutate(task.id);
  }

  function toggleComplete(task: Task) {
    if (task.completed_at) {
      uncompleteTask.mutate(task.id);
      return;
    }
    const completedAt = new Date();
    completeTask.mutate(task.id, {
      onSuccess: () => {
        // Reward is server-side and idempotent — refresh the companion once
        // the Edge Function confirms it awarded.
        void awardTaskXp(task.id).then((ok) => {
          if (ok) queryClient.invalidateQueries({ queryKey: ['companion'] });
        });
        // A completed task stops reminding (notification cancelled, row marked
        // delivered + acknowledged).
        if (userId) {
          void cancelTaskReminder(userId, task.id);
          // Completing a task is activity — it pushes the gentle companion
          // check-in out another few days (only fires after a quiet stretch).
          void scheduleCompanionNudge(userId);
        }
        // A completed recurring task advances to its next occurrence. The spawn
        // is guarded client-side so retries can't double-create it.
        if (task.recurrence && userId) {
          void spawnNextOccurrence(userId, task, completedAt)
            .then((nextTask) => {
              queryClient.invalidateQueries({ queryKey: todayTasksKey });
              // The spawned occurrence is due in the future (weekly +7d,
              // monthly +1mo), so it lands in the Upcoming list — refreshing it
              // here, after the insert, is what makes the new occurrence appear
              // instead of waiting for a later refetch. (completeTask's own
              // invalidation runs before the spawn insert has landed.)
              queryClient.invalidateQueries({ queryKey: upcomingTasksKey });
              if (nextTask?.due_at) {
                void scheduleTaskReminder({
                  userId,
                  taskId: nextTask.id,
                  taskTitle: nextTask.title,
                  dueAt: nextTask.due_at,
                });
              }
            })
            .catch(() => {
              // The completion already happened; a failed spawn just means the
              // next occurrence waits for the next manual capture.
            });
        }
      },
    });
  }

  return (
    <Screen tabBar paddedTop>
      <ScreenHeader
        eyebrow="Companion Life"
        title="Today"
        subtitle={`Hi, ${firstName}! · ${dateLabel}`}
      />

      {/* Companion check-in — the ONE light hero card on this screen */}
      <Card variant="primary" elevated style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={[styles.heroCreature, { backgroundColor: theme.backgroundSelected }]}>
            <Image source={stageMeta.image} style={styles.heroCreatureImage} contentFit="contain" />
          </View>
          <View style={styles.heroCopy}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heroKicker}>
              {companionData.stage} · {companionData.xp} XP
            </ThemedText>
            <ThemedText style={styles.heroTitle}>
              {next ? `${companionData.xp} / ${next.requiredXp} XP to ${next.name}` : 'Fully grown — thriving!'}
            </ThemedText>
          </View>
          <IconButton
            icon="→"
            variant="outlined"
            onPress={() => router.push('/companion')}
            accessibilityLabel="Open companion"
          />
        </View>
        <ProgressBar progress={progress} />
        <ThemedText type="small" themeColor="textSecondary">
          Complete tasks to earn XP — no penalties, ever.
        </ThemedText>
      </Card>

      {/* Quick capture */}
      <SectionTitle>Capture</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <TextField
          label="New task"
          value={title}
          onChangeText={setTitle}
          placeholder="What needs doing?"
          returnKeyType="done"
          onSubmitEditing={submitCapture}
          autoCorrect
        />
        <SegmentedControl options={DUE_CHOICES} value={due} onChange={(v) => setDue(v ?? 'none')} />
        <SegmentedControl
          options={REPEAT_CHOICES}
          value={repeat}
          onChange={(v) => setRepeat(v ?? 'none')}
        />
        {captureError ? <ThemedText type="smallBold">{captureError}</ThemedText> : null}
        <CTAButton label="Add task" onPress={submitCapture} loading={createTask.isPending} fullWidth />
      </Card>

      {/* Open tasks */}
      <SectionTitle>Next up</SectionTitle>
      {todayTasks.isLoading ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Loading your day…
          </ThemedText>
        </Card>
      ) : todayTasks.isError ? (
        <Card>
          <ThemedText type="smallBold">Couldn’t load your tasks.</ThemedText>
          <Button label="Try again" variant="secondary" onPress={() => todayTasks.refetch()} fullWidth />
        </Card>
      ) : (todayTasks.data ?? []).length === 0 ? (
        <Card style={{ gap: Spacing.three }}>
          <ThemedView type="backgroundSelected" style={styles.emptyIllustration}>
            <ThemedText style={styles.emptyEmoji}>🌱</ThemedText>
          </ThemedView>
          <ThemedText type="smallBold">A quiet, gentle start</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Capture your first task above — it will appear here, ready to complete. Completing it
            earns XP for your companion.
          </ThemedText>
        </Card>
      ) : (
        <Card style={{ gap: Spacing.four }}>
          {(todayTasks.data ?? []).map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              dueAt={task.due_at}
              onToggle={() => toggleComplete(task)}
              onEdit={() => openEdit(task)}
              onDelete={() => removeTask(task)}
            />
          ))}
        </Card>
      )}

      {/* Upcoming tasks — due after tomorrow (distant recurring tasks stay visible) */}
      {(upcomingTasks.data ?? []).length > 0 ? (
        <>
          <SectionTitle>Upcoming</SectionTitle>
          <Card style={{ gap: Spacing.four }}>
            {(upcomingTasks.data ?? []).map((task) => (
              <TaskRow
                key={task.id}
                title={task.title}
                dueAt={task.due_at}
                onToggle={() => toggleComplete(task)}
                onEdit={() => openEdit(task)}
                onDelete={() => removeTask(task)}
              />
            ))}
          </Card>
        </>
      ) : null}

      {/* Completed today */}
      {(completedToday.data ?? []).length > 0 ? (
        <>
          <SectionTitle>Done today</SectionTitle>
          <Card style={{ gap: Spacing.four }}>
            {(completedToday.data ?? []).map((task) => (
              <TaskRow
                key={task.id}
                title={task.title}
                dueAt={task.due_at}
                completed
                completedAt={task.completed_at}
                onToggle={() => toggleComplete(task)}
              />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>This month</SectionTitle>
      <Card style={styles.snapshotCard}>
        <ThemedView type="backgroundSelected" style={styles.moneyBadge}>
          <ThemedText type="smallBold">{currencySymbol(currency)}</ThemedText>
        </ThemedView>
        <View style={styles.snapshotCopy}>
          <ThemedText type="smallBold">Spending snapshot</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {monthTotal.isLoading
              ? 'Loading your month…'
              : `${formatCurrency(monthTotal.data ?? 0)} in ${new Date().toLocaleDateString(undefined, { month: 'long' })} — informational only, no judgment.`}
          </ThemedText>
        </View>
        <IconButton
          icon="→"
          variant="outlined"
          onPress={() => router.push('/money')}
          accessibilityLabel="Open money"
        />
      </Card>

      {/* Edit task bottom sheet */}
      <Modal
        visible={editingTask !== null}
        transparent
        animationType="slide"
        onRequestClose={closeEditModal}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                Edit task
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={closeEditModal} accessibilityLabel="Close" />
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetBody}>
              <TextField
                label="Task"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="What needs doing?"
                autoCorrect
              />

              <ThemedText type="small" themeColor="textSecondary">
                {editingTask?.due_at
                  ? `Due: ${formatDueLabel(editingTask.due_at)}`
                  : 'No due date yet.'}
              </ThemedText>
              <SegmentedControl options={DUE_CHOICES} value={editDue} onChange={setEditDue} />
              {editDue === null ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No chip selected — the task keeps its current due date.
                </ThemedText>
              ) : null}

              <SegmentedControl
                options={REPEAT_CHOICES}
                value={editRepeat}
                onChange={(v) => setEditRepeat(v ?? 'none')}
              />

              {editError ? (
                <ThemedText type="smallBold" themeColor="danger">
                  {editError}
                </ThemedText>
              ) : null}

              <CTAButton
                label="Save changes"
                onPress={saveEdit}
                loading={updateTask.isPending}
                fullWidth
              />
              <Button label="Cancel" variant="ghost" onPress={closeEditModal} fullWidth />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.three,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroCreature: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCreatureImage: {
    width: 40,
    height: 40,
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  heroKicker: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  heroTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: 700,
  },
  emptyIllustration: {
    height: 96,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
  },
  snapshotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moneyBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotCopy: {
    flex: 1,
    gap: Spacing.half,
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
});
