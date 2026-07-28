-- Catch reports table.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.catch_reports (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),

  timestamp_utc    timestamptz,
  timestamp_local  text,

  -- Two identifiers, deliberately. An IP cannot identify a device reliably:
  -- mobile carriers put many users behind one address (CGNAT) and rotate them,
  -- so reports from different people merge and one person's reports split.
  -- device_id is stable per phone. Group by device_id for per-user analysis.
  device_id        text,
  ip               inet,

  location_label   text,
  lat              double precision,
  lon              double precision,

  catch_type       text not null check (catch_type in ('fish','crab','other')),
  catch_other      text,
  quantity_kg      numeric(6,2) not null check (quantity_kg >= 0 and quantity_kg <= 1000),

  -- Snapshot of conditions at submission. Stored per row rather than joined
  -- later, because the forecast for a past moment cannot be reconstructed.
  -- Canonical English values ('rising'/'falling', 'high'/'low', English moon
  -- phase) regardless of UI language, so the table stays analysable.
  tide_state         text,
  tide_height_m      numeric(5,3),
  next_extreme_type  text,
  next_extreme_time  text,
  moon_phase         text,
  moon_illum_pct     smallint,
  wind_kmh           numeric(5,1),
  wind_dir_deg       smallint,
  wind_gust_kmh      numeric(5,1),
  humidity_pct       smallint,
  elevation_m        numeric(7,1),
  wave_height_m      numeric(4,2),

  notes            text,
  lang             text
);

create index if not exists catch_reports_created_at_idx on public.catch_reports (created_at desc);
create index if not exists catch_reports_device_idx     on public.catch_reports (device_id);
create index if not exists catch_reports_tide_state_idx on public.catch_reports (tide_state);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Enabled with NO policies, which denies everything to the anon and
-- authenticated roles. That is intentional and is what makes this table safe.
--
-- The Netlify function writes with the SERVICE ROLE key, which bypasses RLS, so
-- inserts keep working. Nothing else can read or write.
--
-- Do NOT add an anon insert policy unless you also move the insert into the
-- browser — and if you do, you lose server-side IP capture and validation, and
-- anyone can write arbitrary rows.
alter table public.catch_reports enable row level security;

-- Read your data from the dashboard (Table Editor / SQL Editor), which uses a
-- privileged connection, or add an explicit policy for a named role here.

comment on table public.catch_reports is
  'Fisher-submitted catch reports with a tide/moon/weather snapshot. Written only by the Netlify catch-report function using the service role key.';
comment on column public.catch_reports.ip is
  'Client IP from the Netlify edge. Personal data under India DPDP Act 2023 and GDPR — add a collection notice before public use.';
