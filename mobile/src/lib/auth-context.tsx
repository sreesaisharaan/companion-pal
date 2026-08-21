import {
  useAuth as useClerkAuth,
  useSession,
  useSignIn,
  useSignUp,
  useUser,
} from '@clerk/expo';
import { useSSO } from '@clerk/expo/experimental';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
} from 'react';

import { requireSupabase, setSupabaseTokenGetter } from '@/lib/supabase';

type OAuthProvider = 'google' | 'apple' | 'github';

/** OAuth strategy for a provider, as consumed by Clerk's SSO flow. */
type OAuthStrategy = `oauth_${OAuthProvider}`;

type AuthContextValue = {
  /** Clerk is configured whenever the publishable key is present (enforced at
   * the root layout, which throws when the key is missing). */
  isConfigured: boolean;
  /** True while Clerk is restoring the persisted session from the token cache. */
  isLoading: boolean;
  /**
   * Signed-in user, shaped like the old Supabase session so existing screens
   * keep working (`session?.user?.id` is the Clerk user id).
   */
  session: { user: { id: string; email?: string | null } } | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Returns needsVerification=true once the email code has been sent. */
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsVerification: boolean }>;
  /** Complete a sign-up with the emailed verification code. */
  verifySignUp: (code: string) => Promise<{ error: string | null }>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, signOut } = useClerkAuth();
  const { user } = useUser();
  const { session: clerkSession, isLoaded: sessionLoaded } = useSession();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();

  // Feed the current Clerk session token to the Supabase client so every data
  // request is authorised (Supabase trusts Clerk's session token via the Clerk
  // Supabase integration). Cleared on sign-out.
  useEffect(() => {
    if (!sessionLoaded || !clerkSession) {
      setSupabaseTokenGetter(null);
      return;
    }
    const getter = async () => {
      try {
        return (await clerkSession.getToken()) ?? null;
      } catch {
        return null;
      }
    };
    setSupabaseTokenGetter(getter);
    return () => setSupabaseTokenGetter(null);
  }, [clerkSession, sessionLoaded]);

  // Clerk has no auth.users row to hook, so the app provisions the profile row
  // on first login; the on_profile_created trigger then creates the companion.
  useEffect(() => {
    if (!isSignedIn || !user) return;
    void (async () => {
      try {
        const db = requireSupabase();
        await db.from('profiles').upsert(
          { id: user.id, email: user.primaryEmailAddress?.emailAddress ?? null },
          { onConflict: 'id' },
        );
      } catch {
        // Provisioning is best-effort: a transient failure is retried on the
        // next launch, and the app still works for rows that already exist.
      }
    })();
  }, [isSignedIn, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured: true,
      isLoading: !isLoaded,
      session:
        isSignedIn && user
          ? { user: { id: user.id, email: user.primaryEmailAddress?.emailAddress ?? null } }
          : null,
      async signIn(email, password) {
        if (!signIn) return { error: 'Clerk is not ready yet.' };
        const result = await signIn.password({ identifier: email, password });
        if (result.error) return { error: result.error.message };
        // The password factor is satisfied; finalize() promotes the sign-in
        // into an active session.
        const { error: finalizeError } = await signIn.finalize();
        return { error: finalizeError?.message ?? null };
      },
      async signUp(email, password) {
        if (!signUp) return { error: 'Clerk is not ready yet.', needsVerification: false };
        const result = await signUp.password({ emailAddress: email, password });
        if (result.error) return { error: result.error.message, needsVerification: false };
        // With email verification enabled, Clerk emails a code before the
        // account is usable — surface the verification step.
        const { error: sendError } = await signUp.verifications.sendEmailCode();
        if (sendError) return { error: sendError.message, needsVerification: false };
        return { error: null, needsVerification: true };
      },
      async verifySignUp(code) {
        if (!signUp) return { error: 'Clerk is not ready yet.' };
        const { error } = await signUp.verifications.verifyEmailCode({ code });
        if (error) return { error: error.message };
        const { error: finalizeError } = await signUp.finalize();
        return { error: finalizeError?.message ?? null };
      },
      async signInWithOAuth(provider) {
        try {
          const { createdSessionId } = await startSSOFlow({
            strategy: `oauth_${provider}` as OAuthStrategy,
          });
          // The SSO flow activates the completed session on success; a null
          // session means the browser flow was cancelled.
          return { error: createdSessionId ? null : 'Sign-in was cancelled.' };
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Sign-in failed.' };
        }
      },
      async signOut() {
        await signOut();
      },
    }),
    [isLoaded, isSignedIn, user, signIn, signUp, startSSOFlow, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
