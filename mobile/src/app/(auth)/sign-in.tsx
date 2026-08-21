import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

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
  const { signIn, signUp, verifySignUp, signInWithOAuth } = useAuth();
  const appearance = useAppearance();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

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

      if (mode === 'sign-up' && 'needsVerification' in result && result.needsVerification) {
        // Clerk emails a verification code before the account is usable.
        setVerifying(true);
      }
    } catch (e) {
      // Clerk can throw structured errors (bot protection, blocked email
      // domain, …) — surface them instead of failing silently.
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      // A thrown signIn/signUp (e.g. network failure) must not strand the
      // button in its loading state.
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifySignUp(code.trim());
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuth(provider: 'google' | 'apple' | 'github') {
    setError(null);
    setOauthLoading(true);
    try {
      const result = await signInWithOAuth(provider);
      if (result.error) {
        setError(result.error);
      }
    } finally {
      setOauthLoading(false);
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

      <Card elevated>
        {/* ── OAuth buttons ─────────────────────────────────────────── */}
        <Button
          label="Continue with Google"
          onPress={() => handleOAuth('google')}
          variant="secondary"
          loading={oauthLoading}
          disabled={submitting}
          fullWidth
        />

        {/* ── Divider ─────────────────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <ThemedText type="small" themeColor="textSecondary">
            or
          </ThemedText>
          <View style={styles.dividerLine} />
        </View>

        {/* ── Email / password ────────────────────────────────────── */}
        {verifying ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              We emailed a verification code to {email.trim()}. Enter it below to finish
              creating your account.
            </ThemedText>
            <TextField
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="6-digit code"
            />
            {error ? (
              <ThemedText type="smallBold" themeColor="danger">{error}</ThemedText>
            ) : null}
            <Button label="Verify email" onPress={handleVerify} loading={submitting} fullWidth />
          </>
        ) : (
          <>
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
            <Button
              label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
              onPress={handleSubmit}
              loading={submitting}
              disabled={oauthLoading}
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
                }}
              />
            </View>
          </>
        )}

        {/* Clerk's bot protection needs this mount point on web sign-ups. */}
        {Platform.OS === 'web' ? <View nativeID="clerk-captcha" /> : null}
      </Card>

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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#C6C6C6',
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
});
