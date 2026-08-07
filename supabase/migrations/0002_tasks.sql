-- 0002_tasks.sql
-- Task capture, recurrence-friendly completion history, and reminder delivery state.
-- All timestamps are timestamptz (UTC storage); render in the profile timezone.

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.task_lists is 'User-defined task lists/categories.';

alter table public.task_lists enable row level security;

create policy "task_lists are readable by the owner"
  on public.task_lists for select
  using (auth.uid() = user_id);

create policy "task_lists are insertable by the owner"
  on public.task_lists for insert
  with check (auth.uid() = user_id);

create policy "task_lists are updatable by the owner"
  on public.task_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "task_lists are deletable by the owner"
  on public.task_lists for delete
  using (auth.uid() = user_id);

create trigger task_lists_set_updated_at
  before update on public.task_lists
  for each row execute function public.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  list_id uuid references public.task_lists (id) on delete set null,
  title text not null check (char_length(title) between 1 and 500),
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  -- RFC 5545-ish recurrence rule, e.g. 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR'.
  recurrence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tasks is 'Tasks. completion writes completed_at; recurring tasks are expanded into task_occurrences.';

alter table public.tasks enable row level security;

create policy "tasks are readable by the owner"
  on public.tasks for select
  using (auth.uid() = user_id);

create policy "tasks are insertable by the owner"
  on public.tasks for insert
  with check (auth.uid() = user_id);

create policy "tasks are updatable by the owner"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "tasks are deletable by the owner"
  on public.tasks for delete
  using (auth.uid() = user_id);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index tasks_user_due_idx on public.tasks (user_id, due_at);
create index tasks_user_completed_idx on public.tasks (user_id, completed_at);
create index tasks_user_list_idx on public.tasks (user_id, list_id);

create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.task_occurrences is 'One row per concrete occurrence of a recurring task; completion history stays intact when the task is edited.';

alter table public.task_occurrences enable row level security;

create policy "task_occurrences are readable by the owner"
  on public.task_occurrences for select
  using (auth.uid() = user_id);

create policy "task_occurrences are insertable by the owner"
  on public.task_occurrences for insert
  with check (auth.uid() = user_id);

create policy "task_occurrences are updatable by the owner"
  on public.task_occurrences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "task_occurrences are deletable by the owner"
  on public.task_occurrences for delete
  using (auth.uid() = user_id);

create index task_occurrences_user_due_idx on public.task_occurrences (user_id, due_at);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  scheduled_for timestamptz not null,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.reminders is 'Reminder settings and delivery state. Delivery is device-local for MVP; this table records intent and app state.';

alter table public.reminders enable row level security;

create policy "reminders are readable by the owner"
  on public.reminders for select
  using (auth.uid() = user_id);

create policy "reminders are insertable by the owner"
  on public.reminders for insert
  with check (auth.uid() = user_id);

create policy "reminders are updatable by the owner"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reminders are deletable by the owner"
  on public.reminders for delete
  using (auth.uid() = user_id);

create index reminders_user_scheduled_idx on public.reminders (user_id, scheduled_for);
