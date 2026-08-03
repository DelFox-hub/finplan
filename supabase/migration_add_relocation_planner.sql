-- Add separate relocation / multi-currency planner tab.
-- Run this if you already executed schema.sql earlier.

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
