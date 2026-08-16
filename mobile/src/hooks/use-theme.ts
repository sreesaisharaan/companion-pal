/**
 * Resolves the active color scheme: a manual Appearance preference (Profile →
 * Appearance) overrides the OS scheme; 'system' (the default) follows it.
 */

import { Colors } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const systemScheme = useColorScheme();
  const preference = useAppearance();

  // useColorScheme can return null before the system scheme is known; default
  // to light rather than indexing Colors with an invalid key.
  const scheme =
    preference === 'light' ? 'light' : preference === 'dark' ? 'dark' : systemScheme;
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
