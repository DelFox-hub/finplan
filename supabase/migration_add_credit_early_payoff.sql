alter table public.recurring_payments
  add column if not exists early_payoff_date date null;
