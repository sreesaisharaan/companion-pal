import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { CTAButton } from '@/components/ui/cta-button';
import { Radius, Spacing } from '@/constants/theme';
import { useCurrency } from '@/hooks/use-currency';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { DEFAULT_COMPANION, STAGE_META, useCompanion } from '@/lib/api/companion';
import { startOfWeek } from '@/lib/api/money';
import { EMPTY_STATS, useCompleteWeeklyReview, useWeekReview } from '@/lib/api/review';
import { useTaskLists } from '@/lib/api/tasks';

/** The review week's Monday — the stats below cover Monday → now, so the
 * label must show the week's start, not today's date. Computed per render
 * (via the screen below) so a screen left open across a week boundary stays
 * correct. */
function weekLabel(): string {
  return startOfWeek().toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });
}

export default function PlanScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const theme = useTheme();
  const { formatCurrency } = useCurrency();

  const weekReview = useWeekReview(userId);
  const completeReview = useCompleteWeeklyReview();
  const companion = useCompanion(userId);
  const taskLists = useTaskLists(userId);

  const stats = weekReview.data ?? EMPTY_STATS;
  const reviewed = stats.reviewed;

  return (
    <Screen tabBar paddedTop>
      <ScreenHeader
        eyebrow="Companion Life"
        title="Plan"
        subtitle="The week in review — and the repeating routines behind it."
        image={STAGE_META[(companion.data ?? DEFAULT_COMPANION).stage].image}
      />

      {/* Weekly review — the ONE light hero card; closes the loop's “review” step */}
      <SectionTitle>Weekly review</SectionTitle>
      <Card variant="primary" elevated style={styles.reviewHero}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.reviewKicker}>
          {reviewed ? 'Reviewed this week' : 'Week of'} · {weekLabel()}
        </ThemedText>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <ThemedText style={styles.statValue}>
              {weekReview.isLoading ? '…' : stats.tasksCompleted}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
              tasks done
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statValue}>
              {weekReview.isLoading ? '…' : `+${stats.xpEarned}`}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
              XP earned
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statValue}>
              {weekReview.isLoading ? '…' : formatCurrency(stats.moneyMinor)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
              money moved
            </ThemedText>
          </View>
        </View>

        {reviewed ? (
          <View style={[styles.donePill, { borderColor: `${theme.primary}66` }]}>
            <ThemedText type="smallBold">✓ Review complete · +15 XP</ThemedText>
          </View>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              A gentle look back at the week. Completing it earns your companion +15 XP — once per
              week, no pressure.
            </ThemedText>
            <CTAButton
              label="Complete review · +15 XP"
              onPress={() => completeReview.mutate()}
              loading={completeReview.isPending}
              fullWidth
            />
          </>
        )}
      </Card>

      <SectionTitle>Your lists</SectionTitle>
      {taskLists.isLoading ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Loading your lists…
          </ThemedText>
        </Card>
      ) : (taskLists.data ?? []).length === 0 ? (
        <Card style={{ gap: Spacing.three }}>
          <ThemedText type="smallBold">No lists yet</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pick a list when capturing a task on Today — your lists appear here, and tasks group
            under them.
          </ThemedText>
        </Card>
      ) : (
        <Card style={{ gap: Spacing.three }}>
          {(taskLists.data ?? []).map((list) => (
            <View key={list.id} style={styles.listRow}>
              <ThemedView type="backgroundSelected" style={styles.listDot} />
              <View style={styles.listCopy}>
                <ThemedText type="smallBold">{list.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tasks here appear grouped under “{list.name}” on Today.
                </ThemedText>
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>Repeating reminders</SectionTitle>
      <Card style={{ gap: Spacing.two }}>
        <ThemedText type="smallBold">Repeat is live in Capture</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Give a task a Daily / Weekly / Monthly repeat — completing it quietly rolls the next
          occurrence onto your list. Tasks with a due date get a local reminder at 9:00 AM on that
          date, cancellable on completion. Opt in from Profile.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reviewHero: {
    gap: Spacing.three,
  },
  reviewKicker: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontSize: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    gap: Spacing.half,
  },
  statValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: 800,
  },
  statLabel: {
    fontSize: 12,
  },
  donePill: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  listDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  listCopy: {
    flex: 1,
    gap: Spacing.half,
  },
});
