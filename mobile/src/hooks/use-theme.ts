/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();

  // useColorScheme can return null before the system scheme is known; default
  // to light rather than indexing Colors with an invalid key.
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
