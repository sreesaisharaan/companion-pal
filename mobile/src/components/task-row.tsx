import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TaskRowProps = {
  title: string;
  dueAt: string | null;
  completed?: boolean;
  completedAt?: string | null;
  onToggle?: () => void;
  /** Opens the edit sheet — tapping the row's copy is the affordance. */
  onEdit?: () => void;
  /** Two-tap delete: the first tap arms an inline "Delete?" confirm. */
  onDelete?: () => void;
};

/** "Today · 6:00 PM", "Overdue · 9:00 AM", "Tomorrow · 12:00 PM", "Aug 12 · 8:00 AM", or null for undated. */
export function formatDueLabel(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayDiff = Math.round((dueDay.getTime() - startOfDay.getTime()) / 86_400_000);
  const time = due.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (dayDiff < 0) return `Overdue · ${time}`;
  if (dayDiff === 0) return `Today · ${time}`;
  if (dayDiff === 1) return `Tomorrow · ${time}`;
  const date = due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}

export function TaskRow({ title, dueAt, completed, completedAt, onToggle, onEdit, onDelete }: TaskRowProps) {
  const theme = useTheme();
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const meta = completed
    ? completedAt
      ? `Done · ${new Date(completedAt).toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : 'Done'
    : formatDueLabel(dueAt);

  // Task rows live on dark secondary cards, so the completed circle inverts to
  // the on-fill ink (light in both schemes) with a dark check to stay visible.
  // chipOnSelected is the scheme-stable dark ink (matches primary in light,
  // stays dark in dark mode where primary turns white).
  const circle = (
    <View
      style={[
        styles.circle,
        {
          backgroundColor: completed ? theme.onSecondary : 'transparent',
          borderColor: completed ? theme.onSecondary : theme.outline,
        },
      ]}>
      {completed ? (
        <ThemedText style={[styles.check, { color: theme.chipOnSelected }]}>✓</ThemedText>
      ) : null}
    </View>
  );

  const copy = (
    <>
      <ThemedText
        type="smallBold"
        style={completed ? [styles.done, { color: theme.textSecondary }] : undefined}
        numberOfLines={2}>
        {title}
      </ThemedText>
      {meta ? (
        <ThemedText type="small" themeColor="textSecondary">
          {meta}
        </ThemedText>
      ) : null}
    </>
  );

  function armDelete() {
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), 2600);
  }

  function confirmDelete() {
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    onDelete?.();
  }

  return (
    <View style={styles.row}>
      {onToggle ? (
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={completed ? `Reopen ${title}` : `Complete ${title}`}
          hitSlop={8}
          style={({ pressed }) => [styles.circleWrap, pressed && styles.pressed]}>
          {circle}
        </Pressable>
      ) : (
        circle
      )}
      {onEdit ? (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title}`}
          style={({ pressed }) => [styles.copy, pressed && styles.pressed]}>
          {copy}
        </Pressable>
      ) : (
        <View style={styles.copy}>{copy}</View>
      )}
      {onDelete ? (
        confirming ? (
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel={`Confirm delete ${title}`}
            style={({ pressed }) => [
              styles.confirm,
              { borderColor: theme.outline, backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.confirmLabel}>
              Delete?
            </ThemedText>
          </Pressable>
        ) : (
          <IconButton
            icon="✕"
            variant="outlined"
            size={30}
            onPress={armDelete}
            accessibilityLabel={`Delete ${title}`}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  circleWrap: {
    padding: Spacing.one,
  },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 16,
  },
  copy: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.one,
  },
  done: {
    textDecorationLine: 'line-through',
  },
  confirm: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  confirmLabel: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
