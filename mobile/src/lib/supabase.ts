import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sessions are persisted with AsyncStorage, matching the official Supabase
 * React Native quickstart. We deliberately do not use expo-secure-store here:
 * Supabase session payloads (access JWT + refresh token + user) routinely
 * exceed SecureStore's size limits, and on Android its encrypted store has
 * long-standing bugs where writes fail or reads throw "Could not
 * encrypt/decrypt the value" (expo/expo#2556, expo/expo#23426) — which
 * silently signed users out on every cold start. AsyncStorage has no such
 * limits and persists reliably across app restarts. The refresh token ends up
 * unencrypted inside the app's private sandbox; that is the standard,
 * documented tradeoff for Supabase + React Native apps.
 */

// True while a web route is being server-rendered (static web output renders
// routes in Node). AsyncStorage's web implementation reads window.localStorage
// directly, which throws here, and no session can exist during SSR anyway — so
// storage calls become no-ops instead of crashing the render.
const isSsr = Platform.OS === 'web' && typeof window === 'undefined';

// A thin SSR guard around AsyncStorage; a straight pass-through on native and
// in the browser. Works on iOS, Android, and web (on web AsyncStorage sits on
// top of localStorage, so existing web sessions keep working unchanged).
const storageAdapter = {
  getItem: (key: string) => (isSsr ? null : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (isSsr ? Promise.resolve() : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (isSsr ? Promise.resolve() : AsyncStorage.removeItem(key)),
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The app authenticates with Clerk; Supabase only stores data. Every request
 * must carry a Clerk session token that Supabase accepts (via the Clerk
 * Supabase integration), so the auth context installs a getter that returns
 * the current Clerk token. Supabase-js invokes it lazily per request.
 */
let supabaseTokenGetter: (() => Promise<string | null>) | null = null;

export function setSupabaseTokenGetter(
  getter: (() => Promise<string | null>) | null,
) {
  supabaseTokenGetter = getter;
}

function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }
  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
    accessToken: async () => (await supabaseTokenGetter?.()) ?? null,
    auth: {
      storage: storageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

export const supabase = createSupabaseClient();

/**
 * The app only reaches authenticated screens when Supabase is configured, so
 * the API layer can safely demand a live client.
 */
export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}
