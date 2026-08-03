-- Finance Diary schema for one-user Vercel + Supabase app.
-- 1) Replace the email below.
-- 2) Run this entire file in Supabase SQL Editor.
-- 3) Create/login with exactly this email.

create extension if not exists pgcrypto;

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

insert into public.app_config (key, value)
values ('allowed_email', 'REPLACE_WITH_YOUR_EMAIL@example.com')
on conflict (key) do update set value = excluded.value;

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_config
    where key = 'allowed_email'
      and lower(value) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calc_start_month text not null,
  diary_start_month text not null,
  forecast_start_month text not null,
  start_balance numeric(14,2) not null default 0,
  plan_income numeric(14,2) not null default 0,
  plan_other numeric(14,2) not null default 0,
  years integer not null default 3,
  currency text not null default 'KZT',
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.income_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category_id uuid references public.expense_categories(id) on delete set null,
  amount numeric(14,2) not null default 0,
  due_day integer not null default 1 check (due_day between 1 and 31),
  payment_type text not null default 'regular' check (payment_type in ('regular','credit')),
  active boolean not null default true,
  total_months integer not null default 0,
  paid_months integer not null default 0,
  valid_from_month text null,
  valid_to_month text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  category_id uuid references public.income_categories(id) on delete set null,
  amount numeric(14,2) not null default 0,
  due_day integer not null default 1 check (due_day between 1 and 31),
  frequency text not null default 'monthly' check (frequency in ('monthly','quarterly','halfyear','yearly')),
  active boolean not null default true,
  valid_from_month text null,
  valid_to_month text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  op_date date not null,
  kind text not null check (kind in ('income','expense')),
  category_id uuid null,
  title text not null default '',
  amount numeric(14,2) not null default 0,
  completed boolean not null default false,
  sort_order integer not null default 0,
  source_recurring_payment_id uuid references public.recurring_payments(id) on delete set null,
  source_recurring_income_id uuid references public.recurring_incomes(id) on delete set null,
  source_month text null,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_payment_exclusions (
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_payment_id uuid not null references public.recurring_payments(id) on delete cascade,
  month text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, recurring_payment_id, month)
);

create table if not exists public.collapsed_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null,
  category_key text not null,
  collapsed boolean not null default true,
  primary key (user_id, month, category_key)
);

alter table public.app_config enable row level security;
alter table public.user_settings enable row level security;
alter table public.expense_categories enable row level security;
alter table public.income_categories enable row level security;
alter table public.recurring_payments enable row level security;
alter table public.recurring_incomes enable row level security;
alter table public.operations enable row level security;
alter table public.monthly_payment_exclusions enable row level security;
alter table public.collapsed_groups enable row level security;

drop policy if exists "allowed config read" on public.app_config;
create policy "allowed config read"
on public.app_config for select
to authenticated
using (public.is_allowed_user());

-- user_settings
drop policy if exists "own settings select" on public.user_settings;
drop policy if exists "own settings insert" on public.user_settings;
drop policy if exists "own settings update" on public.user_settings;
drop policy if exists "own settings delete" on public.user_settings;

create policy "own settings select" on public.user_settings for select to authenticated using (public.is_allowed_user() and user_id = auth.uid());
create policy "own settings insert" on public.user_settings for insert to authenticated with check (public.is_allowed_user() and user_id = auth.uid());
create policy "own settings update" on public.user_settings for update to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());
create policy "own settings delete" on public.user_settings for delete to authenticated using (public.is_allowed_user() and user_id = auth.uid());

-- repeat the same RLS pattern for every user-owned table
drop policy if exists "own expense categories all" on public.expense_categories;
create policy "own expense categories all" on public.expense_categories for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own income categories all" on public.income_categories;
create policy "own income categories all" on public.income_categories for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own recurring payments all" on public.recurring_payments;
create policy "own recurring payments all" on public.recurring_payments for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own recurring incomes all" on public.recurring_incomes;
create policy "own recurring incomes all" on public.recurring_incomes for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own operations all" on public.operations;
create policy "own operations all" on public.operations for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own exclusions all" on public.monthly_payment_exclusions;
create policy "own exclusions all" on public.monthly_payment_exclusions for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());

drop policy if exists "own collapsed groups all" on public.collapsed_groups;
create policy "own collapsed groups all" on public.collapsed_groups for all to authenticated using (public.is_allowed_user() and user_id = auth.uid()) with check (public.is_allowed_user() and user_id = auth.uid());


create table if not exists public.relocation_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.relocation_plans enable row level security;

drop policy if exists "own relocation plans all" on public.relocation_plans;
create policy "own relocation plans all"
on public.relocation_plans for all
to authenticated
using (public.is_allowed_user() and user_id = auth.uid())
with check (public.is_allowed_user() and user_id = auth.uid());

create index if not exists operations_user_month_idx on public.operations (user_id, op_date);
create index if not exists recurring_payments_user_idx on public.recurring_payments (user_id, sort_order);
create index if not exists recurring_incomes_user_idx on public.recurring_incomes (user_id, sort_order);
