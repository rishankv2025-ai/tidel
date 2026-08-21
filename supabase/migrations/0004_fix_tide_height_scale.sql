-- 0004_fix_tide_height_scale.sql
--
-- Corrects tide_height_m on catch reports submitted before 2026-08-21.
--
-- Why: those snapshots were copied from public/tidedata.json while every height
-- in that file was the metre figure divided by 3.280839895 (feet per metre) —
-- the old scraper read the page's metre value as if it were feet and
-- "converted" it. The tide *times* were unaffected and matched the source to
-- the minute, which is how the factor was identified: the 21 Aug 07:01 high
-- read 0.34 m in the file against 1.11 m on the page.
--
-- Effect: Kannur reports were showing a 0.10-0.45 m band where the real range
-- above Mean Lower Low Water is 0.17-1.50 m. Corrected values land at
-- 0.33-1.47 m, just inside the real maximum.
--
-- Reports submitted from 2026-08-21 onward are already correct and are not
-- touched. Run this once, in the Supabase SQL Editor.
--
-- Safe to run twice: each row is matched on its *current* pre-correction value,
-- so a second run finds nothing and updates 0 rows. It cannot double-scale.

update catch_reports as c
set    tide_height_m = v.fixed
from (values
  -- id,  before,  after
  ( 1,     0.340,   1.115),
  ( 2,     0.326,   1.070),
  ( 3,     0.246,   0.807),
  ( 4,     0.307,   1.007),
  ( 5,     0.307,   1.007),
  ( 6,     0.307,   1.007),
  (12,     0.448,   1.470),
  (13,     0.387,   1.270),
  (14,     0.100,   0.328)
) as v(id, before, fixed)
where c.id = v.id
  and c.tide_height_m between v.before - 0.0005 and v.before + 0.0005;

-- Check the result: every value should now sit between 0.17 and 1.50.
-- select id, location_label, quantity_kg, tide_height_m
--   from catch_reports order by id;
