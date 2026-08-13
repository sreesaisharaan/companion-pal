import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  getDeviceTimeZone,
  isValidTimeZone,
  timeZoneOptionSupported,
} from '@/lib/datetime';
import { useAuth } from '@/lib/auth-context';
import { requireSupabase } from '@/lib/supabase';

/** Stored preference meaning "follow the device time zone". */
export const AUTO_TIMEZONE = 'auto';

/** Common IANA zones offered in the Profile picker (Auto + a readable set). */
export const TIMEZONE_OPTIONS = [
  { id: 'UTC', label: 'UTC' },
  { id: 'Europe/London', label: 'London (GMT)' },
  { id: 'Europe/Paris', label: 'Paris (CET)' },
  { id: 'Asia/Dubai', label: 'Dubai (GST)' },
  { id: 'Asia/Kolkata', label: 'Mumbai · Delhi (IST)' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { id: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { id: 'Pacific/Auckland', label: 'Auckland (NZST)' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { id: 'America/New_York', label: 'New York (ET)' },
  { id: 'America/Chicago', label: 'Chicago (CT)' },
  { id: 'America/Denver', label: 'Denver (MT)' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { id: 'America/Toronto', label: 'Toronto (ET)' },
  { id: 'America/Mexico_City', label: 'Mexico City (CST)' },
] as const;

export type TimezoneOption = (typeof TIMEZONE_OPTIONS)[number];

/**
 * Shared with use-currency: both hooks read the same profiles row under the
 * same query key and return the same shape, so React Query serves them from
 * one cache entry and either hook's mutation invalidates both.
 */
const profilesKey = ['profile-preferences'] as const;

/**
 * Single source of truth for the display time zone.
 *
 * Preference is persisted on the `profiles.timezone` row, value `'auto'` or an
 * IANA time zone id. `'auto'` (or a missing/invalid row) resolves to the
 * device time zone via expo-localization. All date/time labels should flow
 * through the `timeZone` it exposes (or the pure helpers in lib/datetime).
 */
export function useTimezone() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const engineHonoursTimeZone = useMemo(() => timeZoneOptionSupported(), []);

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
        .upsert({ id: userId, timezone: preference }, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profilesKey });
    },
  });

  const stored = profileQuery.data?.timezone;
  // A stored value the engine can't resolve is treated as auto rather than
  // letting a corrupt row break every date label.
  const isAuto = !stored || stored === AUTO_TIMEZONE || !isValidTimeZone(stored);
  const timeZone = isAuto ? deviceTimeZone : stored;

  return {
    /** IANA id actually in use. */
    timeZone,
    /** True when following the device (preference is 'auto', unset, or invalid). */
    isAuto,
    deviceTimeZone,
    /** False when the JS engine can't honour manual overrides (very old Hermes). */
    engineHonoursTimeZone,
    setPreference,
    /** True while the stored preference is still loading. */
    isLoading: profileQuery.isLoading,
  };
}
