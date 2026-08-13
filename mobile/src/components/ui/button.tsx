import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useCardVariant } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'cta' | 'primary' | 'secondary' | 'ghost';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Override label color (e.g. white ink on a dark hero). */
  color?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  fullWidth,
  color,
}: ButtonProps) {
  const theme = useTheme();
  // Outlined/ghost buttons inside dark secondary cards default to the on-fill
  // ink so their labels stay legible in both schemes (onSecondary stays light
  // even in dark mode, where onPrimary would be black-on-near-black).
  const cardVariant = useCardVariant();

  // Monochrome language: cta/primary are solid ink, secondary is an outlined
  // rule, ghost is bare ink text. `cta` is the named token for primary actions
  // (Add task, Add transaction, …) so it never visually matches a selected
  // filter pill. Weight and fill carry hierarchy, never hue.
  const isSolid = variant === 'cta' || variant === 'primary';
  const isOutlined = variant === 'secondary';

  const backgroundColor = isSolid ? theme.ctaPrimary : 'transparent';
  const borderColor = isOutlined ? theme.outline : 'transparent';
  const labelColor =
    color ?? (isSolid ? theme.onPrimary : cardVariant === 'secondary' ? theme.onSecondary : theme.text);

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        {
          backgroundColor,
          borderColor,
        },
        isOutlined && styles.outlined,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  outlined: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 16,
    fontWeight: 700,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
