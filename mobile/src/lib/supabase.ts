import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Sessions are persisted in encrypted SecureStore on iOS/Android and in
 * localStorage on web. SecureStore values are capped around 2 KB — Supabase
 * sessions (access JWT + refresh token + user) can exceed that — so oversized
 * values fall back to AsyncStorage rather than silently losing the session.
 */
const storageAdapter = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    }
    try {
      const value = await SecureStore.getItemAsync(key);
      // A successful null means nothing is in SecureStore — a previous setItem
      // may have fallen back to AsyncStorage (oversized session), so read
      // there before giving up. Otherwise the session would silently vanish.
      if (value != null) return value;
    } catch {
      // SecureStore read failed; fall through to AsyncStorage.
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
      return;
    }
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore: nothing persisted under the key.
    }
    await AsyncStorage.removeItem(key);
  },
};

/** True when EXPO_PUBLIC_* credentials are present. The app shows a setup screen otherwise. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createSupabaseClient() {
  if (!isSupabaseConfigured) {
    return null;
  }
  return createClient(supabaseUrl as string, supabaseAnonKey as string, {
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
