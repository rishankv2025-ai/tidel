-- Daily summary alert: a fixed time of day, rather than an offset from a tide.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- These columns are populated ONLY for devices that turned on "deliver even when
-- the app is closed". With that switch off the daily time never leaves the phone
-- — it stays in localStorage and a timer in the page delivers it. So a null
-- daily_time here is meaningful: it says this device chose to keep the schedule
-- to itself, not that it has no schedule.
--
-- Still no IP column on this table, deliberately. See 0002.

alter table public.push_subscriptions
  add column if not exists daily_enabled    boolean not null default false,
  -- HH:MM in Asia/Kolkata wall-clock. Stored as text, not a time-with-zone:
  -- India has no daylight saving, so "05:30" is unambiguous and means the same
  -- instant every day of the year. A UTC offset would have to be recomputed if
  -- the user ever travelled, and would silently drift the alert.
  add column if not exists daily_time       text,
  add column if not exists daily_station_id text,
  add column if not exists daily_lat        double precision,
  add column if not exists daily_lon        double precision,
  -- IST date key ("2026-07-29") of the last summary sent. The cron runs every 5
  -- minutes and the send window is deliberately wide so a late run still
  -- delivers, so this is what keeps it to one per day.
  add column if not exists last_daily_key   text,
  add column if not exists last_daily_at    timestamptz;

-- ADD CONSTRAINT has no IF NOT EXISTS, so guard it to keep this file re-runnable.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'push_subscriptions_daily_time_chk'
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_daily_time_chk
      check (daily_time is null or daily_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

-- The cron's daily pass reads only enabled rows.
create index if not exists push_subscriptions_daily_idx
  on public.push_subscriptions (daily_time) where daily_enabled;

comment on column public.push_subscriptions.daily_time is
  'HH:MM Asia/Kolkata. Null means this device keeps its daily schedule locally and did not opt into background delivery.';
comment on column public.push_subscriptions.last_daily_key is
  'IST date of the last daily summary sent, e.g. 2026-07-29. Prevents repeats within the send window.';
