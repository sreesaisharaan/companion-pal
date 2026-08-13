import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useCardVariant } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';

type IconButtonProps = {
  icon: string;
  onPress?: () => void;
  variant?: 'filled' | 'outlined';
  /** Override content color (e.g. white ink on a dark hero). */
  color?: string;
  /** Override border color for the outlined variant. */
  borderColor?: string;
  size?: number;
  accessibilityLabel?: string;
};

export function IconButton({
  icon,
  onPress,
  variant = 'filled',
  color,
  borderColor,
  size = 40,
  accessibilityLabel,
}: IconButtonProps) {
  const theme = useTheme();
  const filled = variant === 'filled';
  // Outlined glyphs inside dark secondary cards default to the on-fill ink.
  const cardVariant = useCardVariant();

  const backgroundColor = filled ? theme.primary : 'transparent';
  const contentColor =
    color ?? (filled ? theme.onPrimary : cardVariant === 'secondary' ? theme.onSecondary : theme.text);
  const rule = borderColor ?? (filled ? 'transparent' : theme.outline);

  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor,
    borderColor: rule,
    borderWidth: filled ? 0 : StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  const glyph = <ThemedText style={{ fontSize: size * 0.42, color: contentColor }}>{icon}</ThemedText>;

  // Without an onPress this is a static indicator, not a button — don't
  // announce it as interactive to screen readers.
  if (!onPress) {
    return <View style={circle}>{glyph}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [circle, pressed && styles.pressed]}>
      {glyph}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.94 }],
  },
});
