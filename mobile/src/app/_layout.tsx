import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Image } from 'expo-image';
import { router, Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';

import { ErrorBoundary } from '@/components/error-boundary';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { notificationDeepLink, notifications, scheduleCompanionNudge } from '@/lib/notifications';
import { AppQueryProvider } from '@/lib/query-provider';
import { isSupabaseConfigured } from '@/lib/supabase';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured = Boolean(publishableKey);

SplashScreen.preventAutoHideAsync();

/** Per-route browser tab titles (client-side). The Stack.Screen titles below
 * cover static rendering; this keeps the tab titles accurate on web. */
const ROUTE_TITLES: Record<string, string> = {
  '/': 'Today',
  '/plan': 'Plan',
  '/money': 'Money',
  '/companion': 'Companion',
  '/profile': 'Profile',
  '/sign-in': 'Sign in',
};

function usePageTitle() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = ROUTE_TITLES[pathname] ?? 'Companion Life';
  }, [pathname]);
}

/**
 * Branded shell shown while the persisted session is being restored. It is
 * also what static rendering emits, so the exported HTML is never an empty
 * page (no blank flash, and crawlers see real content).
 */
function LoadingShell() {
  return (
    <ThemedView style={styles.shell}>
      <Head>
        <title>Companion Life</title>
      </Head>
      <Image
        source={require('@/assets/images/companion/hatchling.png')}
        style={styles.shellImage}
        contentFit="contain"
      />
      <ThemedText type="subtitle">Companion Life</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.shellCopy}>
        A gentle companion for tasks, spending, and small progress.
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Branded screen shown when required environment configuration is missing
 * (Clerk publishable key, or Supabase URL/anon key). Rendered instead of an
 * uncaught top-level throw, so a fresh checkout opens to a clear message
 * instead of a crash. Uses only theme primitives, so it can render outside
 * the Clerk/query providers.
 */
function ConfigNeededScreen({ message }: { message: string }) {
  return (
    <ThemedView style={styles.shell}>
      <Image
        source={require('@/assets/images/companion/hatchling.png')}
        style={styles.shellImage}
        contentFit="contain"
      />
      <ThemedText type="subtitle">Companion Life</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.shellCopy}>
        {message}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.shellCopy}>
        Add the key to mobile/.env, then restart the dev server.
      </ThemedText>
    </ThemedView>
  );
}

function RootNavigator() {
  const { isLoading, session } = useAuth();
  const userId = session?.user?.id;
  const theme = useTheme();
  usePageTitle();
  const coldStartHandled = useRef(false);

  // Tapping a notification deep-links into the app (native only). The listener
  // covers taps while foregrounded/backgrounded; the last-response read below
  // covers cold starts (app killed), once the session has been restored.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Expo Go on Android has no expo-notifications module (removed in SDK 53),
    // so the deep-link listener is simply absent there — never crash.
    const notificationsModule = notifications();
    if (!notificationsModule) return;
    const subscription = notificationsModule.addNotificationResponseReceivedListener((response) => {
      router.navigate(notificationDeepLink(response));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || isLoading || coldStartHandled.current) return;
    coldStartHandled.current = true;
    const notificationsModule = notifications();
    if (!notificationsModule) return;
    notificationsModule.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        router.navigate(notificationDeepLink(response));
      })
      .catch(() => {});
  }, [isLoading]);

  // Companion check-ins are armed from app activity: opening the app (or
  // completing a task) pushes the gentle nudge out another 3 days, so it only
  // ever fires after a genuinely quiet stretch. Off by default; web is a no-op.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void scheduleCompanionNudge(userId);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void scheduleCompanionNudge(userId);
    });
    return () => subscription.remove();
  }, [userId]);

  useEffect(() => {
    if (!isLoading) {
      // If hiding fails (e.g. already hidden), the app should keep working.
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  if (isLoading) {
    return <LoadingShell />;
  }

  return (
    <>
      <StatusBar style="auto" />
      {/* Per-route titles are handled by usePageTitle (single writer); the
          shell's <Head> covers SSR. The Stack is never mounted during the
          loading state, so title options here would never reach SSR and would
          only add a coarser competing writer for the tabs. */}
      {/* Paint the navigator's content area with the app background. expo-router's
          NavigationContainer always uses react-navigation's light theme behind the
          scenes, so a transparent contentStyle lets that light-grey sheet show
          through during stack transitions / overscroll when dark mode is active. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const missingConfig = !clerkConfigured
    ? 'Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Run: clerk auth login, clerk link, clerk env pull — then restart.'
    : !isSupabaseConfigured
      ? 'Missing EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.'
      : null;

  // The gap screen is intentionally outside the provider tree: ClerkProvider
  // cannot run without its key, and the screen only uses theme primitives.
  // Hide the splash so a native cold start doesn't sit on the logo forever.
  useEffect(() => {
    if (missingConfig) SplashScreen.hideAsync().catch(() => {});
  }, [missingConfig]);

  if (missingConfig) {
    return <ConfigNeededScreen message={missingConfig} />;
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppQueryProvider>
        <AuthProvider>
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </AuthProvider>
      </AppQueryProvider>
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  shellImage: {
    width: 88,
    height: 88,
  },
  shellCopy: {
    textAlign: 'center',
  },
});