import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { localDateString, startOfWeek } from '@/lib/api/money';
import { isoWeekKey } from '@/lib/iso-week';
import { requireSupabase } from '@/lib/supabase';

export const weekReviewKey = ['week-review'] as const;

export type WeekStats = {
  /** Tasks completed since the local week started. */
  tasksCompleted: number;
  /** XP earned this week (ledger sum). */
  xpEarned: number;
  /** Net money movement this week (minor units, expenses negative). */
  moneyMinor: number;
  /** True once the weekly review has been completed this ISO week. */
  reviewed: boolean;
};

const EMPTY_STATS: WeekStats = { tasksCompleted: 0, xpEarned: 0, moneyMinor: 0, reviewed: false };

/**
 * The weekly review snapshot: what happened this week, plus whether the review
 * (+15 XP) has already been completed. All reads go through RLS as the owner.
 */
export function useWeekReview(userId: string | undefined) {
  return useQuery({
    queryKey: [...weekReviewKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const weekStartIso = startOfWeek().toISOString();
      const weekStartDay = localDateString(startOfWeek());

      const [tasks, xp, money, reviews] = await Promise.all([
        db
          .from('tasks')
          .select('id')
          .eq('user_id', userId as string)
          .not('completed_at', 'is', null)
          .gte('completed_at', weekStartIso),
        db
          .from('xp_events')
          .select('amount')
          .eq('user_id', userId as string)
          .gte('created_at', weekStartIso),
        db
          .from('transactions')
          .select('amount_minor')
          .eq('user_id', userId as string)
          .gte('occurred_on', weekStartDay),
        db
          .from('xp_events')
          .select('id')
          .eq('user_id', userId as string)
          .eq('source', 'weekly_review')
          .like('idempotency_key', `weekly_review:${isoWeekKey(new Date())}%`),
      ]);

      const firstError = [tasks, xp, money, reviews].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      return {
        tasksCompleted: (tasks.data ?? []).length,
        xpEarned: (xp.data ?? []).reduce((sum, row) => sum + row.amount, 0),
        moneyMinor: (money.data ?? []).reduce((sum, row) => sum + row.amount_minor, 0),
        reviewed: (reviews.data ?? []).length > 0,
      } satisfies WeekStats;
    },
  });
}

/**
 * Complete the weekly review — asks the Edge Function to award +15 XP. It is
 * idempotent per ISO week server-side, so retries can never double-award.
 */
export function useCompleteWeeklyReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const db = requireSupabase();
      const invoke = () =>
        db.functions.invoke('award-xp', { body: { source: 'weekly_review' } });
      let { data, error } = await invoke();
      if (error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        ({ data, error } = await invoke());
      }
      if (error) throw error;
      return data as { awarded: number; xp: number; weekly_review_done: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companion'] });
      queryClient.invalidateQueries({ queryKey: weekReviewKey });
    },
  });
}

export { EMPTY_STATS };

