import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { weekReviewKey } from '@/lib/api/review';
import { requireSupabase } from '@/lib/supabase';

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  list_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  recurrence: string | null;
  created_at: string;
};

export const todayTasksKey = ['tasks', 'today'] as const;
export const completedTodayKey = ['tasks', 'completed-today'] as const;
export const upcomingTasksKey = ['tasks', 'upcoming'] as const;

/** Start of the local calendar day (used to split today vs overdue). */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** End of the local calendar day. */
export function endOfToday(): Date {
  const start = startOfToday();
  return new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59, 59, 999);
}

/**
 * End of the local day AFTER today. The Today screen previews tomorrow's tasks
 * too (capture offers a "Tomorrow" option), so its query window runs through
 * the end of tomorrow.
 */
export function endOfTomorrow(): Date {
  const end = endOfToday();
  end.setDate(end.getDate() + 1);
  return end;
}

/**
 * Open tasks for Today: overdue first, then by due time, undated last.
 * Completed tasks are excluded — they live in the "done today" query.
 */
export function useTodayTasks(userId: string | undefined) {
  return useQuery({
    queryKey: [...todayTasksKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('tasks')
        .select('*')
        .eq('user_id', userId as string)
        .is('completed_at', null)
        .or(`due_at.is.null,due_at.lte.${endOfTomorrow().toISOString()}`)
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

/**
 * Open tasks due after the Today window (end of tomorrow) — distant recurring
 * tasks stay visible here until they roll into "Next up". Soonest first.
 */
export function useUpcomingTasks(userId: string | undefined) {
  return useQuery({
    queryKey: [...upcomingTasksKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('tasks')
        .select('*')
        .eq('user_id', userId as string)
        .is('completed_at', null)
        .gt('due_at', endOfTomorrow().toISOString())
        .order('due_at', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

/** Tasks completed since the local day started, newest first. */
export function useCompletedToday(userId: string | undefined) {
  return useQuery({
    queryKey: [...completedTodayKey, userId],
    enabled: !!userId,
    queryFn: async () => {
      const db = requireSupabase();
      const { data, error } = await db
        .from('tasks')
        .select('*')
        .eq('user_id', userId as string)
        .not('completed_at', 'is', null)
        .gte('completed_at', startOfToday().toISOString())
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });
}

export type CreateTaskInput = {
  title: string;
  /** ISO timestamp or null for "someday". */
  dueAt: string | null;
  /** 'daily' | 'weekly' | 'monthly', or null for a one-off. */
  recurrence?: string | null;
};

export function useCreateTask(userId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, dueAt, recurrence }: CreateTaskInput) => {
      if (!userId) throw new Error('Not signed in');
      const db = requireSupabase();
      const { data, error } = await db
        .from('tasks')
        .insert({ user_id: userId, title: title.trim(), due_at: dueAt, recurrence: recurrence ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todayTasksKey });
    },
  });
}

/** Next due moment for a recurring task: same wall-clock time, next period. */
export function nextOccurrenceDue(task: Pick<Task, 'due_at' | 'recurrence'>, completedAt: Date): string {
  const base = task.due_at ? new Date(task.due_at) : completedAt;
  const next = new Date(base);
  if (task.recurrence === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (task.recurrence === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (task.recurrence === 'monthly') {
    // Clamp to the target day of month (Jan 31 → Feb 28/29).
    const targetDay = base.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, lastDay));
  }
  return next.toISOString();
}

/**
 * Create the next occurrence of a completed recurring task. Guarded: an open
 * future task with the same title + recurrence is treated as already spawned,
 * so retries and uncomplete→recomplete can never double-create.
 */
export async function spawnNextOccurrence(
  userId: string,
  task: Task,
  completedAt: Date = new Date(),
): Promise<Task | null> {
  if (!task.recurrence) return null;
  const db = requireSupabase();

  const { data: existing } = await db
    .from('tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('title', task.title)
    .eq('recurrence', task.recurrence)
    .is('completed_at', null)
    .not('due_at', 'is', null)
    .gte('due_at', new Date().toISOString())
    .limit(1);
  if ((existing ?? []).length > 0) return null;

  const { data, error } = await db
    .from('tasks')
    .insert({
      user_id: userId,
      title: task.title,
      notes: task.notes,
      list_id: task.list_id,
      recurrence: task.recurrence,
      due_at: nextOccurrenceDue(task, completedAt),
    })
    .select()
    .single();
  if (error) throw error;
  return (data ?? null) as Task | null;
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const db = requireSupabase();
      const { error } = await db
        .from('tasks')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todayTasksKey });
      queryClient.invalidateQueries({ queryKey: completedTodayKey });
      // The weekly review stats include completed tasks — keep them fresh.
      queryClient.invalidateQueries({ queryKey: weekReviewKey });
      // Completing an upcoming task removes it from that list (and a recurring
      // completion spawns a new distant occurrence that should appear there).
      queryClient.invalidateQueries({ queryKey: upcomingTasksKey });
    },
  });
}

export function useUncompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({    mutationFn: async (taskId: string) => {
      const db = requireSupabase();
      const { error } = await db.from('tasks').update({ completed_at: null }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todayTasksKey });
      queryClient.invalidateQueries({ queryKey: completedTodayKey });
      // Un-completing also changes the weekly stats and the upcoming list.
      queryClient.invalidateQueries({ queryKey: weekReviewKey });
      queryClient.invalidateQueries({ queryKey: upcomingTasksKey });
    },
  });
}

export type UpdateTaskInput = {
  title?: string;
  /** ISO timestamp, null to clear the due date, or omit to leave unchanged. */
  dueAt?: string | null;
  /** 'daily' | 'weekly' | 'monthly', or null to make it a one-off. */
  recurrence?: string | null;
};

/**
 * Edit an existing task (title, due date, repeat). Only the provided fields
 * are changed; returns the saved row. A due-date change is what drives the
 * reminder reschedule on the Today screen.
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      title,
      dueAt,
      recurrence,
    }: UpdateTaskInput & { taskId: string }) => {
      const db = requireSupabase();
      const patch: Record<string, unknown> = {};
      if (title !== undefined) patch.title = title.trim();
      if (dueAt !== undefined) patch.due_at = dueAt;
      if (recurrence !== undefined) patch.recurrence = recurrence;
      const { data, error } = await db
        .from('tasks')
        .update(patch)
        .eq('id', taskId)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      // An edited task can move between Next up and Upcoming.
      queryClient.invalidateQueries({ queryKey: todayTasksKey });
      queryClient.invalidateQueries({ queryKey: upcomingTasksKey });
    },
  });
}

/** Delete a task. Reminder rows cascade with it (see reminders.task_id). */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const db = requireSupabase();
      const { error } = await db.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todayTasksKey });
      queryClient.invalidateQueries({ queryKey: upcomingTasksKey });
      queryClient.invalidateQueries({ queryKey: completedTodayKey });
      // Deleting a completed task changes the weekly review stats.
      queryClient.invalidateQueries({ queryKey: weekReviewKey });
    },
  });
}

/**
 * Ask the server to award XP for a completed task. The Edge Function decides
 * the amount and writes idempotently (same idempotency key per task), so a
 * retry or re-completion can never double-count. Failures are silent — the
 * checkmark already happened; XP simply waits for the next retry path.
 */
export async function awardTaskXp(taskId: string): Promise<boolean> {
  const db = requireSupabase();
  const invoke = () => db.functions.invoke('award-xp', { body: { task_id: taskId } });

  // One retry: the award is idempotent server-side, so a transient failure is
  // safe to re-attempt and can never double-count.
  let { error } = await invoke();
  if (error) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    ({ error } = await invoke());
  }
  return !error;
}
