import { Image } from 'expo-image';
import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname } from 'expo-router';
import Head from 'expo-router/head';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { notificationDeepLink, scheduleCompanionNudge } from '@/lib/notifications';
import { AppQueryProvider } from '@/lib/query-provider';

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

function RootNavigator() {
  const { isLoading, session } = useAuth();
  const userId = session?.user?.id;
  usePageTitle();
  const coldStartHandled = useRef(false);

  // Tapping a notification deep-links into the app (native only). The listener
  // covers taps while foregrounded/backgrounded; the last-response read below
  // covers cold starts (app killed), once the session has been restored.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      router.navigate(notificationDeepLink(response));
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || isLoading || coldStartHandled.current) return;
    coldStartHandled.current = true;
    Notifications.getLastNotificationResponseAsync()
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppQueryProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </AppQueryProvider>
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
