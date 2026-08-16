import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ImageSourcePropType } from 'react-native';

import { requireSupabase } from '@/lib/supabase';

export type CompanionStage = 'hatchling' | 'growing' | 'thriving';

export type Companion = {
  id: string;
  user_id: string;
  species: string;
  name: string | null;
  stage: CompanionStage;
  xp: number;
  quiet_mode: boolean;
  created_at: string;
};

export const STAGE_THRESHOLDS = { hatchling: 0, growing: 250, thriving: 750 } as const;

export const STAGE_META: Record<
  CompanionStage,
  { image: ImageSourcePropType; blurb: string }
> = {
  hatchling: {
    image: require('@/assets/images/companion/hatchling.png'),
    blurb: '“We’re starting together.”',
  },
  growing: {
    image: require('@/assets/images/companion/growing.png'),
    blurb: '“My routines are taking shape.”',
  },
  thriving: {
    image: require('@/assets/images/companion/thriving.png'),
    blurb: '“I’ve built momentum.”',
  },
};

/** A fresh hatchling — used while loading or if the row is missing. */
export const DEFAULT_COMPANION: Companion = {
  id: '',
  user_id: '',
  species: 'creature',
  name: null,
  stage: 'hatchling',
  xp: 0,
  quiet_mode: false,
  created_at: '',
};

export function useCompanion(userId: string | undefined) {
  return useQuery({
    queryKey: ['companion', userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('companions')
        .select('*')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as Companion | null) ?? DEFAULT_COMPANION;
    },
  });
}

/** Progress (0..1) toward the next stage. Thriving returns 1. */
export function stageProgress(companion: Companion): number {  const { stage, xp } = companion;
  if (stage === 'thriving') return 1;
  const current = STAGE_THRESHOLDS[stage];
  const next = stage === 'growing' ? STAGE_THRESHOLDS.thriving : STAGE_THRESHOLDS.growing;
  return Math.max(0, Math.min(1, (xp - current) / (next - current)));
}

/** Next stage name + XP required, or null when fully grown. */
export function nextStage(companion: Companion): { name: string; requiredXp: number } | null {
  if (companion.stage === 'hatchling') return { name: 'Growing', requiredXp: STAGE_THRESHOLDS.growing };
  if (companion.stage === 'growing') return { name: 'Thriving', requiredXp: STAGE_THRESHOLDS.thriving };
  return null;
}

/**
 * Toggle companion rewards (companions.quiet_mode). Rewards off pauses XP
 * nudges entirely — including the gentle companion check-in notifications.
 * Only cosmetic fields are writable by the client; XP/stage stay server-side.
 */
export function useSetCompanionQuietMode(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quietMode: boolean) => {
      if (!userId) throw new Error('Not signed in');
      const db = requireSupabase();
      const { error } = await db
        .from('companions')
        .update({ quiet_mode: quietMode })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companion'] });
    },
  });
}

/** Name the companion (cosmetic, like quiet_mode — XP/stage stay server-side). */
export function useSetCompanionName(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      if (!userId) throw new Error('Not signed in');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Give your companion a name.');
      const db = requireSupabase();
      const { error } = await db
        .from('companions')
        .update({ name: trimmed })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companion'] });
    },
  });
}
