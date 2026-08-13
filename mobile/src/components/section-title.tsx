import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export function SectionTitle({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 13,
  },
});
