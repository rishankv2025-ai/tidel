-- Web push subscriptions, one row per browser install.
-- Run this in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- WHY THE SERVER NEEDS THIS AT ALL:
--
-- An in-page setTimeout cannot deliver a tide alert on a phone. Android freezes
-- a backgrounded tab within minutes and then discards it, so no JavaScript runs
-- until the user reopens the app — which is exactly when the "late" alert used
-- to appear. The only way to reach a closed browser is for a server to send a
-- push message, and that means the server must know who to notify and when. So
-- the alert rule is stored here alongside the subscription, rather than living
-- only in the device's localStorage.

create table if not exists public.push_subscriptions (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The push endpoint IS the identity of a subscription: the browser mints it,
  -- it is unique per install, and it changes if the user clears site data. So it
  -- is the conflict target for upserts rather than device_id, which survives
  -- resubscription and would otherwise collapse two live endpoints into one.
  endpoint      text not null unique,
  p256dh        text not null,        -- client public key, for payload encryption
  auth          text not null,        -- client auth secret

  -- Same id the catch reports use, so a fisherman's alerts and catches can be
  -- lined up later. Not unique here: one device can hold several endpoints over
  -- time, and stale ones are pruned on delivery failure rather than on sight.
  device_id     text,

  -- Where to read tides from, and where to check the weather. These differ:
  -- tides come from the nearest station, conditions from the actual spot.
  station_id    text not null,
  lat           double precision,
  lon           double precision,
  lang          text not null default 'en' check (lang in ('en','ml')),

  -- The alert rule, mirrored from the device. Kept as separate columns rather
  -- than one blob so the cron job can filter in SQL if this ever grows.
  enabled       boolean not null default true,
  lead_minutes  integer not null default 30 check (lead_minutes >= 0 and lead_minutes <= 1440),
  tide_type     text    not null default 'low' check (tide_type in ('low','high','any')),
  conditions    jsonb   not null default '[]'::jsonb,

  -- Dedup. The cron runs every few minutes, so without a marker the same tide
  -- would be pushed on every run inside its window. Holds
  -- "<station>|<tide ts>|<lead>|<type>" for the last alert actually sent.
  last_sent_key text,
  last_sent_at  timestamptz,

  -- Consecutive send failures. A dead endpoint returns 404/410 and is deleted
  -- outright; this counts the softer errors (timeouts, 5xx) so a permanently
  -- broken row can be reaped without guessing.
  failures      integer not null default 0
);

-- The cron job's only query: enabled rows. Partial index keeps it cheap even
-- once most rows are disabled or stale.
create index if not exists push_subscriptions_enabled_idx
  on public.push_subscriptions (station_id) where enabled;
create index if not exists push_subscriptions_device_idx
  on public.push_subscriptions (device_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Enabled with NO policies, exactly as catch_reports. This table is worse than
-- catch_reports to leak: an endpoint plus its p256dh/auth pair lets anyone who
-- holds them send a notification to that device. Only the service role, which
-- bypasses RLS inside the Netlify functions, may touch it.
alter table public.push_subscriptions enable row level security;

comment on table public.push_subscriptions is
  'Web push subscriptions and their tide alert rules. Written only by the Netlify push-subscribe function and read only by the scheduled push-send function, both using the service role key.';
comment on column public.push_subscriptions.auth is
  'Push auth secret. Treat as a credential — with the endpoint it authorises sending notifications to that device.';
