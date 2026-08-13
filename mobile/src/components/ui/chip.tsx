import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  const theme = useTheme();

  // Selected = a light pill with ink text (never solid ink — that is reserved
  // for CTA buttons); unselected = a quiet dark outline.
  const surface = {
    backgroundColor: selected ? theme.chipSelected : theme.chipUnselected,
    borderColor: selected ? theme.primary : theme.outline,
  };
  const content = (
    <ThemedText
      type="smallBold"
      themeColor={selected ? 'text' : 'textSecondary'}
      style={selected ? { color: theme.chipOnSelected } : undefined}>
      {label}
    </ThemedText>
  );

  // Without an onPress the chip is a static pill, not a button — don't
  // announce it as interactive to screen readers.
  if (!onPress) {
    return <View style={[styles.base, surface]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.base, surface, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  pressed: {
    opacity: 0.8,
  },
});
