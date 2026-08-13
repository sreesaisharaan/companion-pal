import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Radius, Spacing } from '@/constants/theme';
import {
  DEFAULT_COMPANION,
  nextStage,
  STAGE_META,
  stageProgress,
  STAGE_THRESHOLDS,
  useCompanion,
} from '@/lib/api/companion';
import { useAuth } from '@/lib/auth-context';

const STAGES = [
  {
    name: 'Hatchling',
    key: 'hatchling',
    image: STAGE_META.hatchling.image,
    xp: STAGE_THRESHOLDS.hatchling,
  },
  {
    name: 'Growing',
    key: 'growing',
    image: STAGE_META.growing.image,
    xp: STAGE_THRESHOLDS.growing,
  },
  {
    name: 'Thriving',
    key: 'thriving',
    image: STAGE_META.thriving.image,
    xp: STAGE_THRESHOLDS.thriving,
  },
] as const;

const XP_RULES = [
  { action: 'Task completed', xp: '+10' },
  { action: 'On-time completion', xp: '+5' },
  { action: 'Weekly review', xp: '+15' },
];

export default function CompanionScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const companion = useCompanion(userId);
  const data = companion.data ?? DEFAULT_COMPANION;
  const progress = stageProgress(data);
  const next = nextStage(data);
  const stageMeta = STAGE_META[data.stage];

  return (
    <Screen tabBar paddedTop>
      <ScreenHeader
        eyebrow="Companion Life"
        title="Companion"
        subtitle="Three stages, gentle by design."
      />

      {/* XP hero — the ONE light hero card on this screen */}
      <Card variant="primary" elevated style={styles.hero}>
        <Image source={stageMeta.image} style={styles.heroImage} contentFit="contain" />
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heroKicker}>
          {data.stage} · {data.xp} XP
        </ThemedText>
        <ProgressBar progress={progress} height={10} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.heroMeta}>
          {next
            ? `${data.xp} / ${next.requiredXp} XP — ${next.name} unlocks at ${next.requiredXp}.`
            : 'The highest stage — momentum kept. XP is earned, never taken away.'}
        </ThemedText>
      </Card>

      <SectionTitle>The journey</SectionTitle>
      {companion.isLoading ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Loading your companion…
          </ThemedText>
        </Card>
      ) : (
        <Card style={{ gap: Spacing.three }}>
          {STAGES.map((stage) => {
            const isCurrent = data.stage === stage.key;
            return (
              <View key={stage.key} style={styles.stageRow}>
                <ThemedView
                  type={isCurrent ? 'cardPrimary' : 'backgroundElement'}
                  style={styles.stageBadge}>                    <Image source={stage.image} style={styles.stageImage} contentFit="contain" />
                </ThemedView>
                <View style={styles.stageCopy}>
                  <ThemedText type="smallBold">{stage.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {stage.xp} XP · {STAGE_META[stage.key].blurb}
                  </ThemedText>
                </View>
                {isCurrent ? <Chip label="Current" selected /> : null}
              </View>
            );
          })}
        </Card>
      )}

      <SectionTitle>How XP works</SectionTitle>
      <Card style={{ gap: Spacing.two }}>
        {XP_RULES.map((rule) => (
          <View key={rule.action} style={styles.ruleRow}>
            <ThemedText type="small" style={{ flex: 1 }}>
              {rule.action}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="onSecondary">
              {rule.xp}
            </ThemedText>
          </View>
        ))}
        <ThemedText type="small" themeColor="textSecondary" style={styles.ruleNote}>
          XP is only earned for helpful actions — never for opening the app. No XP loss, no
          penalties, and daily caps keep milestones meaningful. Rewards can be reduced or disabled.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  heroImage: {
    width: 56,
    height: 56,
  },
  heroKicker: {
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 13,
  },
  heroMeta: {
    textAlign: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stageBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageImage: {
    width: 34,
    height: 34,
  },
  stageCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  ruleNote: {
    marginTop: Spacing.two,
  },
});
