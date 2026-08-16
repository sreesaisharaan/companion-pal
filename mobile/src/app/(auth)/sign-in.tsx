import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { SectionTitle } from '@/components/section-title';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { APPEARANCE_OPTIONS, setAppearancePreference, useAppearance } from '@/hooks/use-appearance';
import { useAuth } from '@/lib/auth-context';

export default function SignInScreen() {
  const { isConfigured, signIn, signUp } = useAuth();
  const appearance = useAppearance();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === 'sign-in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (mode === 'sign-up') {
        // With email confirmation enabled, signUp returns no session — tell the
        // user what to do next instead of silently switching modes.
        setConfirmationSent(true);
        setError(null);
      }
    } finally {
      // A thrown signIn/signUp (e.g. network failure) must not strand the
      // button in its loading state.
      setSubmitting(false);
    }
  }

  return (
    <Screen tabBar paddedTop>
      <ThemedView style={styles.brandSection}>
        <ThemedView type="primarySoft" style={styles.creatureBadge}>
          <Image
            source={require('@/assets/images/companion/hatchling.png')}
            style={styles.creatureImage}
            contentFit="contain"
          />
        </ThemedView>
        <ThemedText type="subtitle" style={styles.centerText}>
          Companion Life
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          A gentle companion for tasks, spending, and small progress.
        </ThemedText>
      </ThemedView>

      {isConfigured ? (
        <Card elevated>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            placeholder={mode === 'sign-in' ? 'Your password' : 'At least 6 characters'}
          />
          {error ? (
            <ThemedText type="smallBold" themeColor="danger">{error}</ThemedText>
          ) : null}
          {confirmationSent ? (
            <ThemedView type="successSoft" style={styles.confirmBox}>
              <ThemedText type="small" themeColor="success">
                Account created! Check your inbox for a confirmation link, then sign in.
              </ThemedText>
            </ThemedView>
          ) : null}
          <Button
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
          />
          <View style={styles.switchRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {mode === 'sign-in' ? 'New here?' : 'Already have an account?'}
            </ThemedText>
            <Button
              label={mode === 'sign-in' ? 'Create an account' : 'Sign in instead'}
              variant="ghost"
              onPress={() => {
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
                setError(null);
                setConfirmationSent(false);
              }}
            />
          </View>
        </Card>
      ) : (
        <Card elevated>
          <ThemedText type="smallBold">Setup required</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add your Supabase project credentials to <ThemedText type="code">mobile/.env</ThemedText>{' '}
            (see <ThemedText type="code">mobile/.env.example</ThemedText>) and run{' '}
            <ThemedText type="code">supabase db push</ThemedText> against your project. The app
            will light up once EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set.
          </ThemedText>
        </Card>
      )}

      <SectionTitle>Preferences</SectionTitle>
      <Card style={{ gap: Spacing.three }}>
        <View style={styles.prefRow}>
          <View style={styles.prefCopy}>
            <ThemedText type="small">Appearance</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Dark mode for low-light evenings — or follow your device. Applies instantly.
            </ThemedText>
          </View>
        </View>
        <SegmentedControl
          options={APPEARANCE_OPTIONS}
          value={appearance}
          onChange={(value) => value && setAppearancePreference(value)}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brandSection: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  creatureBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatureImage: {
    width: 64,
    height: 64,
  },
  centerText: {
    textAlign: 'center',
  },
  switchRow: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  prefCopy: {
    flex: 1,
    gap: Spacing.half,
  },
  confirmBox: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
