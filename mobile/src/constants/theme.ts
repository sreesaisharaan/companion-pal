/**
 * Companion Life design tokens — monochrome.
 *
 * A strict black & white design system. Light mode is white paper with black
 * ink and hairline grey rules; dark mode inverts it. Differentiation comes
 * from the value ramp (near-black → mid-grey → faint grey) and typographic
 * weight rather than hue, so every pair stays within accessible contrast.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B0B0B',
    background: '#FFFFFF',
    backgroundElement: '#F5F5F5',
    backgroundSelected: '#E8E8E8',
    textSecondary: '#707070',
    // Brand — pure ink
    primary: '#000000',
    primarySoft: '#EFEFEF',
    onPrimary: '#FFFFFF',
    // Ink for the dark supporting cards (secondary fill). Distinct from
    // onPrimary, which flips with the scheme and is only correct on primary
    // surfaces (e.g. solid CTA buttons).
    onSecondary: '#FFFFFF',
    // Hairline rules: cards, inputs
    border: '#E5E5E5',
    // Stronger rule for interactive outlines (buttons)
    outline: '#C6C6C6',
    // Card hierarchy: one light "hero" per screen, dark supports
    cardPrimary: '#FFFFFF',
    cardSecondary: '#0B0B0B',
    // Primary action buttons (solid ink) — distinct from selected pills
    ctaPrimary: '#0B0B0B',
    // Segmented/filter pills: selected is a light pill, unselected an outline
    chipSelected: '#FFFFFF',
    chipOnSelected: '#0B0B0B',
    chipUnselected: 'transparent',
    // Shared progress bars (ink fill on the selected track)
    progressFill: '#0B0B0B',
    progressTrack: '#E8E8E8',
    // Semantic — neutral greys; weight + context carry the meaning
    success: '#3A3A3A',
    successSoft: '#F2F2F2',
    info: '#5A5A5A',
    infoSoft: '#F7F7F7',
    danger: '#0B0B0B',
    dangerSoft: '#F2F2F2',
    // Companion stages — ink ramp, darkest = earliest
    hatchling: '#0B0B0B',
    growing: '#4D4D4D',
    thriving: '#8A8A8A',
  },
  dark: {
    text: '#F5F5F5',
    background: '#000000',
    backgroundElement: '#161616',
    backgroundSelected: '#242424',
    textSecondary: '#9A9A9A',
    // Brand — pure white
    primary: '#FFFFFF',
    primarySoft: '#1D1D1D',
    onPrimary: '#000000',
    // Dark supporting cards keep light ink — unlike onPrimary, which is black
    // in this scheme and would vanish on the near-black secondary fill.
    onSecondary: '#F5F5F5',
    // Hairline rules
    border: '#2A2A2A',
    // Stronger rule for interactive outlines (buttons)
    outline: '#3D3D3D',
    // Card hierarchy: raised sheet (hero) over near-black supports
    cardPrimary: '#242424',
    cardSecondary: '#0D0D0D',
    // Primary action buttons (solid paper)
    ctaPrimary: '#F5F5F5',
    // Selected pill stays light in both schemes (black ink on it)
    chipSelected: '#F5F5F5',
    chipOnSelected: '#0B0B0B',
    chipUnselected: 'transparent',
    // Shared progress bars
    progressFill: '#F5F5F5',
    progressTrack: '#2A2A2A',
    // Semantic — neutral greys
    success: '#E0E0E0',
    successSoft: '#1D1D1D',
    info: '#B5B5B5',
    infoSoft: '#1A1A1A',
    danger: '#F5F5F5',
    dangerSoft: '#1D1D1D',
    // Companion stages — ink ramp, lightest = earliest
    hatchling: '#F5F5F5',
    growing: '#B0B0B0',
    thriving: '#7A7A7A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
  seven: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const Elevation = {
  sm: Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }, default: { elevation: 1 } }) as object,
  md: Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } }, default: { elevation: 3 } }) as object,
};

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 640;
