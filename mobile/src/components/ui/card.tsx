import { createContext, useContext, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CardVariant = 'primary' | 'secondary';

/**
 * Card hierarchy context: the ONE light "hero" card per screen is `primary`;
 * every informational/supporting card is `secondary` (dark fill). ThemedText
 * (and friends) read this to default their ink, so a `secondary` card's text
 * renders in the on-fill color without per-text overrides.
 */
const CardVariantContext = createContext<CardVariant>('primary');

export function useCardVariant(): CardVariant {
  return useContext(CardVariantContext);
}

type CardProps = ViewProps &
  PropsWithChildren<{
    /** `primary` = the light hero card; `secondary` = dark supporting card. */
    variant?: CardVariant;
    elevated?: boolean;
    onPress?: () => void;
  }>;

export function Card({ style, variant = 'secondary', elevated, onPress, children, ...rest }: CardProps) {
  const theme = useTheme();

  const content = (
    <View
      style={[
        styles.base,
        {
          backgroundColor: variant === 'primary' ? theme.cardPrimary : theme.cardSecondary,
          borderColor: theme.border,
        },
        variant === 'primary' && elevated && Elevation.sm,
        variant === 'primary' && styles.heroRule,
        style,
      ]}
      {...rest}>
      <CardVariantContext.Provider value={variant}>{children}</CardVariantContext.Provider>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  /** The light hero sheet needs a crisper rule + shadow to lift off the page. */
  heroRule: {
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});
