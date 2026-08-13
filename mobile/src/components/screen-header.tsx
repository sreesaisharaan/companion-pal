import { Image } from 'expo-image';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type ScreenHeaderProps = {
  /** Small muted brand line above the title, e.g. "Companion Life". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** The companion creature, shown in a circular badge on the right. */
  image?: ImageSourcePropType;
};

/**
 * The one standard page header for tab screens: brand eyebrow, bold uppercase
 * title, a muted subtitle, and an optional companion-creature badge. Every
 * screen uses the same component so the header language stays identical.
 */
export function ScreenHeader({ eyebrow, title, subtitle, image }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
            {eyebrow}
          </ThemedText>
          <ThemedText style={styles.title}>{title}</ThemedText>
        </View>
        {image ? (
          <ThemedView type="backgroundSelected" style={styles.badge}>
            <Image source={image} style={styles.badgeImage} contentFit="contain" />
          </ThemedView>
        ) : null}
      </View>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: Spacing.half,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 12,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 40,
    height: 40,
  },
});
