-- Analysis queries for catch_reports.
-- Paste any of these into Supabase → SQL Editor → New query → Run.
--
-- CAVEAT ON EVERY AVERAGE BELOW: with only a handful of rows these numbers are
-- noise, not signal. Each grouped query carries a `having count(*) >= 5` guard
-- so a single lucky trip cannot masquerade as a pattern. Raise that threshold as
-- data accumulates. Until you have a few dozen reports per bucket, read these as
-- "what is being collected", not "what is true".


-- ── 0. Data health: is anything arriving, and is the snapshot populated? ─────
select
  count(*)                                             as reports,
  count(distinct device_id)                            as devices,
  count(distinct location_label)                        as places,
  min(created_at)::date                                as first_report,
  max(created_at)::date                                as latest_report,
  round(100.0 * count(tide_state)   / nullif(count(*),0), 1) as pct_with_tide,
  round(100.0 * count(wind_kmh)     / nullif(count(*),0), 1) as pct_with_weather,
  round(100.0 * count(moon_phase)   / nullif(count(*),0), 1) as pct_with_moon
from catch_reports;


-- ── 1. Most recent reports, readable ────────────────────────────────────────
select
  created_at at time zone 'Asia/Kolkata' as local_time,
  location_label,
  catch_type,
  coalesce(nullif(catch_other,''), catch_type) as what,
  quantity_kg,
  tide_state,
  tide_height_m,
  moon_phase,
  wind_kmh,
  wave_height_m,
  nullif(notes,'') as notes
from catch_reports
order by created_at desc
limit 50;


-- ── 2. Does the tide state matter? (the headline question) ───────────────────
select
  tide_state,
  count(*)                        as reports,
  round(avg(quantity_kg), 2)      as avg_kg,
  round(stddev_samp(quantity_kg), 2) as sd_kg,
  max(quantity_kg)                as best_kg
from catch_reports
where tide_state is not null and tide_state <> ''
group by tide_state
having count(*) >= 5
order by avg_kg desc;


-- ── 3. Catch vs tide height, in 20 cm bands ─────────────────────────────────
select
  width_bucket(tide_height_m, 0, 0.6, 3) as height_band,
  case width_bucket(tide_height_m, 0, 0.6, 3)
    when 1 then '0.0–0.2 m' when 2 then '0.2–0.4 m'
    when 3 then '0.4–0.6 m' else 'outside range' end as band_label,
  count(*)                   as reports,
  round(avg(quantity_kg), 2) as avg_kg
from catch_reports
where tide_height_m is not null
group by 1
having count(*) >= 5
order by 1;


-- ── 4. Does the moon phase matter? ──────────────────────────────────────────
select
  moon_phase,
  round(avg(moon_illum_pct))  as avg_illum_pct,
  count(*)                    as reports,
  round(avg(quantity_kg), 2)  as avg_kg
from catch_reports
where moon_phase is not null and moon_phase <> ''
group by moon_phase
having count(*) >= 5
order by avg_kg desc;


-- ── 5. Does wind matter? 10 km/h bands ──────────────────────────────────────
select
  width_bucket(wind_kmh, 0, 40, 4)  as wind_band,
  case width_bucket(wind_kmh, 0, 40, 4)
    when 1 then '0–10 km/h'  when 2 then '10–20 km/h'
    when 3 then '20–30 km/h' when 4 then '30–40 km/h'
    else '40+ km/h' end             as band_label,
  count(*)                          as reports,
  round(avg(quantity_kg), 2)        as avg_kg,
  round(avg(wave_height_m), 2)      as avg_wave_m
from catch_reports
where wind_kmh is not null
group by 1
having count(*) >= 5
order by 1;


-- ── 6. Best time of day (IST hour) ──────────────────────────────────────────
select
  extract(hour from created_at at time zone 'Asia/Kolkata')::int as ist_hour,
  count(*)                   as reports,
  round(avg(quantity_kg), 2) as avg_kg
from catch_reports
group by 1
having count(*) >= 3
order by avg_kg desc;


-- ── 7. Per-fisher summary ───────────────────────────────────────────────────
-- Group by device_id, NOT ip. A mobile carrier puts many users behind one
-- address (CGNAT) and rotates them, so ip merges different people and splits
-- the same person over time.
select
  device_id,
  count(*)                                  as trips,
  round(sum(quantity_kg), 1)                as total_kg,
  round(avg(quantity_kg), 2)                as avg_kg,
  count(distinct location_label)            as places_fished,
  max(created_at at time zone 'Asia/Kolkata') as last_seen
from catch_reports
group by device_id
order by total_kg desc;


-- ── 8. Species mix by location ──────────────────────────────────────────────
select
  location_label,
  count(*)                                                        as reports,
  count(*) filter (where catch_type = 'fish')                     as fish,
  count(*) filter (where catch_type = 'crab')                     as crab,
  count(*) filter (where catch_type = 'other')                    as other,
  round(avg(quantity_kg), 2)                                      as avg_kg
from catch_reports
group by location_label
order by reports desc;


-- ── 9. Best single condition combination ────────────────────────────────────
-- Ranks tide state x wind band. Needs real volume before it means anything.
select
  tide_state,
  case when wind_kmh < 10 then 'calm (<10)'
       when wind_kmh < 20 then 'moderate (10-20)'
       else 'windy (20+)' end as wind_band,
  count(*)                    as reports,
  round(avg(quantity_kg), 2)  as avg_kg
from catch_reports
where tide_state is not null and wind_kmh is not null
group by 1, 2
having count(*) >= 5
order by avg_kg desc
limit 10;


-- ── 10. Export everything as JSON (for offline analysis) ────────────────────
select jsonb_pretty(jsonb_agg(to_jsonb(c) - 'ip'))   -- ip stripped, it is personal data
from (select * from catch_reports order by created_at) c;
