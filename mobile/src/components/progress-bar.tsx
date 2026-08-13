import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type ProgressBarProps = {
  /** 0..1 */
  progress: number;
  height?: number;
  track?: string;
  fill?: string;
};

export function ProgressBar({ progress, height = 8, track, fill }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  // Defaults come from the shared progressFill/progressTrack tokens so the XP
  // bar, budget bars, and companion bar all use the same fill language.
  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor: track ?? theme.progressTrack,
          height,
          borderRadius: height / 2,
        },
      ]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: fill ?? theme.progressFill,
            width: `${clamped * 100}%`,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
