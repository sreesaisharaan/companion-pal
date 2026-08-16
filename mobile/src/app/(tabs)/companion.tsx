import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { CTAButton } from '@/components/ui/cta-button';
import { IconButton } from '@/components/ui/icon-button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_COMPANION,
  nextStage,
  STAGE_META,
  stageProgress,
  STAGE_THRESHOLDS,
  useCompanion,
  useSetCompanionName,
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
  const theme = useTheme();
  const setName = useSetCompanionName(userId);

  const [namingOpen, setNamingOpen] = useState(false);
  const [namingDismissed, setNamingDismissed] = useState(false);
  const [nameText, setNameText] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  // Auto-offer the name sheet the first time the companion resolves without a
  // name — derived from render state (no effect), and only once per session:
  // dismissing marks it done and the inline prompt stays as the fallback.
  const unnamed = !companion.isLoading && !!companion.data && !companion.data.name;
  const showNaming = namingOpen || (unnamed && !namingDismissed);

  function openNaming() {
    // Prefill the current name when renaming; blank when naming for the first
    // time (the auto-offered sheet is a fresh prompt).
    setNameText(data.name ?? '');
    setNameError(null);
    setNamingOpen(true);
  }

  function closeNaming() {
    if (setName.isPending) return;
    setNamingDismissed(true);
    setNamingOpen(false);
  }

  function saveName() {
    if (setName.isPending) return;
    if (!nameText.trim()) {
      setNameError('Give your companion a name.');
      return;
    }
    setNameError(null);
    setName.mutate(nameText, {
      onSuccess: () => {
        // Close immediately even if the refetched companion hasn't landed yet.
        setNamingOpen(false);
        setNamingDismissed(true);
      },
      onError: (error) => setNameError(error.message || 'Could not save the name.'),
    });
  }

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
        {data.name ? (
          // The name is tappable — rename anytime (matches the sheet's copy).
          <Pressable
            onPress={openNaming}
            accessibilityRole="button"
            accessibilityLabel={`Rename companion, currently ${data.name}`}
            style={({ pressed }) => [styles.heroNameRow, pressed && styles.pressed]}>
            <ThemedText style={styles.heroName}>{data.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.renameHint}>
              edit
            </ThemedText>
          </Pressable>
        ) : !companion.isLoading ? (
          <Pressable
            onPress={openNaming}
            accessibilityRole="button"
            accessibilityLabel="Name your companion"
            style={({ pressed }) => [styles.namePrompt, pressed && styles.pressed]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Give them a name ›
            </ThemedText>
          </Pressable>
        ) : null}
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
                  style={styles.stageBadge}>
                  <Image source={stage.image} style={styles.stageImage} contentFit="contain" />
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

      {/* Name your companion — bottom sheet */}
      <Modal
        visible={showNaming}
        transparent
        animationType="slide"
        onRequestClose={closeNaming}
        statusBarTranslucent>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeNaming} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>
                Name your companion
              </ThemedText>
              <IconButton icon="✕" size={32} onPress={closeNaming} accessibilityLabel="Close" />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              They&apos;re all yours — give them a name. You can change it anytime.
            </ThemedText>
            <TextField
              label="Name"
              value={nameText}
              onChangeText={setNameText}
              placeholder="e.g. Mochi"
              autoFocus
              maxLength={24}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />
            {nameError ? (
              <ThemedText type="smallBold" themeColor="danger">
                {nameError}
              </ThemedText>
            ) : null}
            <CTAButton label="Save name" onPress={saveName} loading={setName.isPending} fullWidth />
            <Button label="Not now" variant="ghost" onPress={closeNaming} fullWidth />
          </View>
        </View>
      </Modal>
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
  heroName: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: 800,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  renameHint: {
    fontSize: 12,
    opacity: 0.7,
  },
  namePrompt: {
    paddingVertical: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
  },
});
