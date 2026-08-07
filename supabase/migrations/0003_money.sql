-- 0003_money.sql
-- Manual money tracking. Amounts are INTEGER MINOR UNITS (cents, paise, …) —
-- never floating point. Dates are local calendar dates (occurred_on).

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.budget_categories enable row level security;

create policy "budget_categories are readable by the owner"
  on public.budget_categories for select
  using (auth.uid() = user_id);

create policy "budget_categories are insertable by the owner"
  on public.budget_categories for insert
  with check (auth.uid() = user_id);

create policy "budget_categories are updatable by the owner"
  on public.budget_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budget_categories are deletable by the owner"
  on public.budget_categories for delete
  using (auth.uid() = user_id);

create trigger budget_categories_set_updated_at
  before update on public.budget_categories
  for each row execute function public.set_updated_at();

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.budget_categories (id) on delete set null,
  amount_minor bigint not null check (amount_minor <> 0),
  currency text not null default 'USD',
  note text,
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.transactions is 'Manual transactions. amount_minor is integer minor units; negative = expense, positive = income. Informational only, never financial advice.';

alter table public.transactions enable row level security;

create policy "transactions are readable by the owner"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "transactions are insertable by the owner"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "transactions are updatable by the owner"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions are deletable by the owner"
  on public.transactions for delete
  using (auth.uid() = user_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create index transactions_user_date_idx on public.transactions (user_id, occurred_on);
create index transactions_user_category_idx on public.transactions (user_id, category_id);

create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.budget_categories (id) on delete cascade,
  -- First day of the month this budget applies to (local calendar date).
  month date not null,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

comment on table public.monthly_budgets is 'Optional per-category monthly budget indicator. amount_minor is integer minor units.';

alter table public.monthly_budgets enable row level security;

create policy "monthly_budgets are readable by the owner"
  on public.monthly_budgets for select
  using (auth.uid() = user_id);

create policy "monthly_budgets are insertable by the owner"
  on public.monthly_budgets for insert
  with check (auth.uid() = user_id);

create policy "monthly_budgets are updatable by the owner"
  on public.monthly_budgets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "monthly_budgets are deletable by the owner"
  on public.monthly_budgets for delete
  using (auth.uid() = user_id);

create trigger monthly_budgets_set_updated_at
  before update on public.monthly_budgets
  for each row execute function public.set_updated_at();
