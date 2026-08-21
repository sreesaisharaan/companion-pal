import { Component, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

type ErrorBoundaryProps = PropsWithChildren<{
  /** Optional fallback UI; defaults to the branded error screen. */
  fallback?: ReactNode;
}>;

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * Catches render errors anywhere in the child tree and shows a friendly
 * branded fallback instead of a white/red screen. Provides a retry button
 * that reloads the app (or re-renders the children if hot reload is active).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, you'd send this to a crash reporter (Sentry, etc.).
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  private retry = () => {
    // Clear the error so the children re-render. If the error was transient
    // (e.g. a corrupted task slipping through a guard), this recovers cleanly.
    // A persistent error will re-trigger the boundary on the next render.
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <ThemedView style={styles.container}>
          <Card variant="primary" elevated style={styles.card}>
            <ThemedView type="backgroundSelected" style={styles.badge}>
              <Image
                source={require('@/assets/images/companion/hatchling.png')}
                style={styles.badgeImage}
                contentFit="contain"
              />
            </ThemedView>
            <ThemedText type="smallBold" style={styles.title}>
              Something went wrong
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
              The app ran into an unexpected error. Your data is safe — this is a
              display issue, not a data loss.
            </ThemedText>
            <Button label="Try again" onPress={this.retry} fullWidth />
          </Card>
        </ThemedView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
});
