/**
 * Manual appearance override (System / Light / Dark).
 *
 * Without this the app simply follows the OS color scheme. The preference is
 * stored on-device (AsyncStorage) so it applies from the very first frame and
 * needs no server round-trip, and it is pushed to the platform via
 * Appearance.setColorScheme where supported so native chrome (status bar,
 * alerts) follows the same choice.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';

export const APPEARANCE_OPTIONS: { value: AppearancePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const STORAGE_KEY = 'appearance-preference';

let current: AppearancePreference = 'system';
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Read the stored preference once at startup (AsyncStorage is async). */
async function load() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') current = stored;
  } catch {
    // Unreadable storage — fall back to following the system.
  }
  emit();
}

export function getAppearancePreference(): AppearancePreference {
  return current;
}

export function setAppearancePreference(preference: AppearancePreference) {
  current = preference;
  emit();
  void AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => {});
  // Best-effort: push the override to the platform so system UI follows.
  // null resets to the OS scheme (RN types it without null on some versions,
  // so assert the callable form).
  const scheme = preference === 'system' ? null : preference;
  if (typeof Appearance.setColorScheme === 'function') {
    (Appearance.setColorScheme as (scheme: 'light' | 'dark' | null) => void)(scheme);
  }
}

/** Subscribes to the shared appearance preference (defaults to 'system'). */
export function useAppearance(): AppearancePreference {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => current,
  );
}
