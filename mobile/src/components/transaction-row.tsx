import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconButton } from '@/components/ui/icon-button';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrency } from '@/hooks/use-currency';
import { useTheme } from '@/hooks/use-theme';
import { categoryEmoji, formatDayLabel } from '@/lib/api/money';

type TransactionRowProps = {
  note: string | null;
  categoryName: string | null;
  amountMinor: number;
  occurredOn: string;
  onEdit?: () => void;
  onDelete: () => void;
};

/**
 * A transaction row with a two-tap delete: the first tap arms an inline
 * "Delete?" confirm that expires after a moment — no native Alert needed
 * (Alert is a no-op on react-native-web).
 */
export function TransactionRow({
  note,
  categoryName,
  amountMinor,
  occurredOn,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const theme = useTheme();
  const { formatCurrency } = useCurrency();
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const isIncome = amountMinor > 0;
  const amount = isIncome ? `+${formatCurrency(amountMinor)}` : formatCurrency(amountMinor);
  const title = note?.trim() || categoryName || 'Transaction';

  function armDelete() {
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), 2600);
  }

  function confirmDelete() {
    if (timer.current) clearTimeout(timer.current);
    setConfirming(false);
    onDelete();
  }

  return (
    <View style={styles.row}>
      <ThemedView type="backgroundSelected" style={styles.icon}>
        <ThemedText style={styles.emoji}>{categoryEmoji(categoryName)}</ThemedText>
      </ThemedView>

      <Pressable
        onPress={onEdit}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={onEdit ? `Edit ${title}` : undefined}
        style={styles.copy}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDayLabel(occurredOn)}
          {categoryName ? ` · ${categoryName}` : ''}
        </ThemedText>
      </Pressable>

      <ThemedText type={isIncome ? 'smallBold' : 'small'} numberOfLines={1}>
        {amount}
      </ThemedText>

      {confirming ? (
        <Pressable
          onPress={confirmDelete}
          accessibilityRole="button"
          accessibilityLabel="Confirm delete"
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
          accessibilityLabel="Delete transaction"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 17,
  },
  copy: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.one,
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
