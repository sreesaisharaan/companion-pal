import { PropsWithChildren } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = PropsWithChildren<{
  /** Padding under the bottom tab bar */
  tabBar?: boolean;
  /** Larger top breathing room for header screens */
  paddedTop?: boolean;
}>;

/**
 * Standard content wrapper: applies safe-area insets, centers content at a
 * readable max width, and lets content scroll when it overflows.
 */
export function Screen({ children, tabBar, paddedTop }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  // On web the floating bottom nav pill overlays content — tab screens get
  // extra clearance so the last card is never hidden behind it.
  const contentPaddingBottom =
    Platform.OS === 'web' ? (tabBar ? Spacing.seven + Spacing.five : Spacing.four) : 0;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: theme.background }]}
      contentInset={{
        top: insets.top,
        bottom: (tabBar ? BottomTabInset : 0) + Spacing.four + insets.bottom,
      }}
      contentContainerStyle={styles.contentContainer}>
      <View
        style={[
          styles.content,
          { paddingTop: paddedTop ? Spacing.six : Spacing.four, paddingBottom: contentPaddingBottom },
        ]}>
        {children}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
