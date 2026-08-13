import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Localization from 'expo-localization';
import { useCallback, useMemo } from 'react';

import { formatMoney } from '@/lib/api/money';
import { useAuth } from '@/lib/auth-context';
import { requireSupabase } from '@/lib/supabase';

/** Stored preference meaning "follow the device currency". */
export const AUTO_CURRENCY = 'auto';

/** Currencies offered in the Profile picker (Auto + a common, readable set). */
export const CURRENCY_OPTIONS = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'ZAR', label: 'South African Rand' },
] as const;

/** ISO code for a picker option, or null for the Auto row. */
export type CurrencyOption = (typeof CURRENCY_OPTIONS)[number];

/**
 * The device's currency from expo-localization (not navigator.language — that
 * is unreliable on native). Falls back to USD if the OS reports none.
 */
export function getDeviceCurrency(): string {
  return Localization.getLocales()[0]?.currencyCode ?? 'USD';
}

/** Localised symbol for a code ("$", "₹", "€", …). Falls back to the code. */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

const profilesKey = ['profile-preferences'] as const;

/**
 * Single source of truth for display currency.
 *
 * Preference is persisted on the `profiles.preferred_currency` row (mirrors
 * the timezone column), value `'auto'` or an ISO 4217 code; 'auto' (or a
 * missing row) resolves to the device currency. Exposes a `formatCurrency`
 * that formats integer minor units in the resolved currency.
 */
export function useCurrency() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const deviceCurrency = useMemo(() => getDeviceCurrency(), []);

  const profileQuery = useQuery({
    queryKey: [...profilesKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('profiles')
        .select('preferred_currency, timezone')
        .eq('id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as { preferred_currency: string | null; timezone: string | null } | null;
    },
  });

  const setPreference = useMutation({
    mutationFn: async (preference: string) => {
      if (!userId) throw new Error('Not signed in');
      const db = requireSupabase();
      const { error } = await db
        .from('profiles')
        .upsert({ id: userId, preferred_currency: preference }, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profilesKey });
    },
  });

  const stored = profileQuery.data?.preferred_currency;
  const isAuto = !stored || stored === AUTO_CURRENCY;
  const currency = isAuto ? deviceCurrency : stored;

  const formatCurrency = useCallback(
    (amountMinor: number): string => {
      try {
        return formatMoney(amountMinor, currency);
      } catch {
        // Unknown stored code shouldn't break rendering — fall back to USD.
        return formatMoney(amountMinor, 'USD');
      }
    },
    [currency],
  );

  return {
    /** ISO code actually in use. */
    currency,
    /** True when following the device (preference is 'auto' or unset). */
    isAuto,
    deviceCurrency,
    formatCurrency,
    setPreference,
    /** True while the stored preference is still loading. */
    isLoading: profileQuery.isLoading,
  };
}
