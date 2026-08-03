-- Separate the first visible month of the operations diary from the calendar forecast.

alter table public.user_settings
  add column if not exists diary_start_month text;

alter table public.user_settings
  add column if not exists forecast_start_month text;

update public.user_settings
set
  diary_start_month = coalesce(diary_start_month, calc_start_month),
  forecast_start_month = coalesce(forecast_start_month, calc_start_month);

alter table public.user_settings
  alter column diary_start_month set not null;

alter table public.user_settings
  alter column forecast_start_month set not null;
