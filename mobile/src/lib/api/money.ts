import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireSupabase } from '@/lib/supabase';

export type BudgetCategory = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  position: number;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  category_id: string | null;
  /** Integer minor units (cents). Negative = expense, positive = income. */
  amount_minor: number;
  currency: string;
  note: string | null;
  /** Local calendar date (YYYY-MM-DD). */
  occurred_on: string;
  created_at: string;
};

export type MoneyRange = 'week' | 'month' | 'all';

/**
 * Suggested categories shown before the user has created any. They are
 * materialised (get-or-create) the first time a transaction uses one.
 */
export const DEFAULT_CATEGORIES = [
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Transport', emoji: '🚌' },
  { name: 'Fun', emoji: '🎬' },
] as const;

const CATEGORY_EMOJI: Record<string, string> = {
  Groceries: '🛒',
  Transport: '🚌',
  Fun: '🎬',
};

/** Emoji for a category name, or a neutral glyph for uncategorised. */
export function categoryEmoji(name: string | null): string {
  return (name && CATEGORY_EMOJI[name]) ?? '⋯';
}

export const categoriesKey = ['budget-categories'] as const;
export const transactionsKey = ['transactions'] as const;
export const budgetsKey = ['budgets'] as const;

export type MonthlyBudget = {
  id: string;
  user_id: string;
  category_id: string;
  /** First day of the budget month (local calendar date). */
  month: string;
  amount_minor: number;
  created_at: string;
};

/** Local calendar date as YYYY-MM-DD (transactions store local dates, not UTC). */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday of the current week, at local midnight. */
export function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
}

/** First day of the current month, at local midnight. */
export function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Inclusive lower bound for a range, or null for "all time". */
export function rangeStartString(range: MoneyRange): string | null {
  if (range === 'all') return null;
  return localDateString(range === 'week' ? startOfWeek() : startOfMonth());
}

export function useBudgetCategories(userId: string | undefined) {
  return useQuery({
    queryKey: [...categoriesKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('budget_categories')
        .select('*')
        .eq('user_id', userId as string)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BudgetCategory[];
    },
  });
}

export function useTransactions(userId: string | undefined, range: MoneyRange) {
  return useQuery({
    queryKey: [...transactionsKey, userId, range],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const start = rangeStartString(range);
      let request = db
        .from('transactions')
        .select('*')
        .eq('user_id', userId as string)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (start) {
        request = request.gte('occurred_on', start);
      }
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? []) as Transaction[];
    },
  });
}

/** Sum of this month's transactions (net, expenses negative) — for the Today snapshot. */
export function useMonthTotal(userId: string | undefined) {
  return useQuery({
    queryKey: ['transactions', 'month-total', userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('transactions')
        .select('amount_minor')
        .eq('user_id', userId as string)
        .gte('occurred_on', localDateString(startOfMonth()));
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + row.amount_minor, 0);
    },
  });
}

/** Budgets for a given month (first-of-month local date), keyed by category. */
export function useMonthlyBudgets(userId: string | undefined, month: string) {
  return useQuery({
    queryKey: [...budgetsKey, userId, month],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('monthly_budgets')
        .select('*')
        .eq('user_id', userId as string)
        .eq('month', month);
      if (error) throw error;
      return (data ?? []) as MonthlyBudget[];
    },
  });
}

export type SaveBudgetInput = {
  /** Category name — materialised via get-or-create if needed. */
  categoryName: string;
  /** Positive integer minor units. */
  amountMinor: number;
  /** First day of the budget month (local calendar date). */
  month: string;
};

/** Upsert a monthly budget for a category (unique on user+category+month). */
export function useSaveBudget(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryName, amountMinor, month }: SaveBudgetInput) => {
      if (!userId) throw new Error('Not signed in');
      const db = requireSupabase();
      const categoryId = await resolveCategoryId(db, userId, categoryName);
      const { error } = await db.from('monthly_budgets').upsert(
        { user_id: userId, category_id: categoryId, month, amount_minor: amountMinor },
        { onConflict: 'user_id,category_id,month' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsKey });
      queryClient.invalidateQueries({ queryKey: categoriesKey });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = requireSupabase();
      const { error } = await db.from('monthly_budgets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsKey });
    },
  });
}

/**
 * Categories are get-or-create by name: picking a suggested category the
 * first time materialises it in the DB, so the breakdown stays meaningful
 * without a separate category-management screen.
 */
async function resolveCategoryId(
  db: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const { data: existing } = await db
    .from('budget_categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await db
    .from('budget_categories')
    .insert({ user_id: userId, name })
    .select('id')
    .maybeSingle();
  if (error) {
    // Unique violation (Postgres 23505): a concurrent get-or-create won the
    // race, so re-read the row the other caller created instead of failing.
    if (error.code === '23505') {
      const { data: raced } = await db
        .from('budget_categories')
        .select('id')
        .eq('user_id', userId)
        .eq('name', name)
        .maybeSingle();
      if (raced) return raced.id;
    }
    throw error;
  }
  if (!created) throw new Error('Could not resolve the category.');
  return created.id;
}

export type SaveTransactionInput = {
  /** Signed integer minor units: negative = expense, positive = income. */
  amountMinor: number;
  /** Category name, or null for uncategorised. */
  categoryName: string | null;
  note: string | null;
  /** Local calendar date (YYYY-MM-DD). */
  occurredOn: string;
};

export function useSaveTransaction(userId: string | undefined) {
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: transactionsKey });
    queryClient.invalidateQueries({ queryKey: categoriesKey });
  };

  return useMutation({
    mutationFn: async ({ id, ...input }: SaveTransactionInput & { id?: string }) => {
      if (!userId) throw new Error('Not signed in');
      const db = requireSupabase();
      const categoryId = input.categoryName
        ? await resolveCategoryId(db, userId, input.categoryName)
        : null;
      const row = {
        user_id: userId,
        category_id: categoryId,
        amount_minor: input.amountMinor,
        note: input.note?.trim() || null,
        occurred_on: input.occurredOn,
      };
      const { error } = id
        ? await db.from('transactions').update(row).eq('id', id)
        : await db.from('transactions').insert(row);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const db = requireSupabase();
      const { error } = await db.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: transactionsKey });
    },
  });
}

/** "$12.34" / "₹12.34" — integer minor units, never floats. Callers must
 * pass the display currency (see hooks/use-currency). */
export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
    amountMinor / 100,
  );
}

/** "Today", "Yesterday", or a short weekday date. */
export function formatDayLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  // Guard against a corrupt occurred_on: an invalid Date would throw inside
  // toLocaleDateString and red-screen the list. Show the raw value instead.
  if (Number.isNaN(date.getTime())) return dateStr;
  const today = new Date();
  const dayDiff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  );
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
