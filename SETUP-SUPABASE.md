# Catch reports → Supabase

> [!IMPORTANT]
> **The project URL in the plan does not exist.** `rlxaryvbpxgitapembllq.supabase.co`
> returns `Non-existent domain` from DNS (checked twice, while `supabase.com`
> resolves fine), and its project ref is **21 characters** where Supabase refs
> are 20. It is a typo. Get the real URL from your dashboard:
> **Project Settings → Data API → Project URL**.
>
> Nothing is hardcoded, so once you set the two variables below it works.

## Why this is server-side, not in the browser

The plan proposed `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and a
`supabase.from('catch_reports')![alt text](image.png).insert()` call from React. This repo does it from
the Netlify function instead, for three reasons:

1. **You asked for the IP as the user identifier.** A browser cannot read its own
   public IP. A client-side insert writes `NULL` into `ip` on every row, silently.
   Only the server sees the caller's address.
2. **Validation would be bypassable.** A browser holding an insert-capable key can
   post any row it likes — any `catch_type`, any `quantity_kg`.
3. **No key in the bundle.** Anything `VITE_`-prefixed is compiled into the public
   JavaScript. That is *acceptable* for a Supabase anon key **only if RLS is
   enabled with a correct policy** — and without RLS it means anyone who opens
   DevTools can read every report (including IPs) or delete the table's contents.

So the browser posts to `/api/catch-report`, and the function inserts using the
**service role** key, which never leaves the server.

## 1. Run the migration

Supabase dashboard → **SQL Editor** → **New query** → paste
[supabase/migrations/0001_catch_reports.sql](supabase/migrations/0001_catch_reports.sql)
→ **Run**.

That creates `public.catch_reports`, three indexes, and — importantly — enables
**Row Level Security with no policies**, which denies all access to the `anon`
and `authenticated` roles. The service role bypasses RLS, so the function still
writes. Nothing else can read or write.

The schema constrains what the app already validates: `catch_type` must be
`fish`/`crab`/`other`, `quantity_kg` must be 0–1000.

## 2. Get the two values

**Project Settings → Data API**

| Variable | Where |
|---|---|
| `SUPABASE_URL` | *Project URL*, e.g. `https://abcdefghijklmnopqrst.supabase.co` |
| `SUPABASE_SERVICE_KEY` | *Project API keys* → **`service_role`** (click to reveal) |

> [!WARNING]
> The `service_role` key bypasses Row Level Security entirely. Treat it like a
> database password. Never commit it, never put it in a `VITE_` variable, never
> paste it into client code. If it leaks, rotate it in the dashboard immediately.

## 3. Set them

**Netlify:** Site configuration → Environment variables → add both → redeploy.

**Locally:** add to `.env` (already gitignored) and run `netlify dev`:

```
SUPABASE_URL=https://your-real-ref.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...
```

Supabase takes priority over Google Sheets. If both are configured, Supabase
wins; if only the Sheets variables are set, it falls back to Sheets, so your
existing setup keeps working.

## 4. Verify

```bash
curl -X POST http://localhost:8888/api/catch-report \
  -H 'content-type: application/json' \
  -d '{"catchType":"fish","quantity":2.5,"deviceId":"test-1","locationLabel":"Azhikkal","lat":11.939,"lon":75.312}'
```

| Response | Meaning |
|---|---|
| `{"ok":true,"provider":"supabase"}` | working — check the Table Editor |
| `{"error":"No storage configured"}` | neither provider's variables are set |
| `502 … "supabase 401 …"` | key wrong, or you used the anon key instead of service_role |
| `502 … "supabase 404 …"` | table missing — run the migration |
| `502 … "fetch failed"` | URL wrong or unreachable (this is what the plan's URL gives) |

## Analysing the data

The point of the snapshot columns is correlation. For example, average catch by
tide state:

```sql
select tide_state, count(*) as reports, round(avg(quantity_kg),2) as avg_kg
from catch_reports
where catch_type = 'fish'
group by tide_state
order by avg_kg desc;
```

Or catch against wind, bucketed:

```sql
select width_bucket(wind_kmh, 0, 40, 4) as wind_bucket,
       round(avg(quantity_kg),2) as avg_kg, count(*) as n
from catch_reports
group by 1 order by 1;
```

Group by `device_id` for per-user analysis — not by `ip`, which merges different
people behind one mobile carrier address and splits one person over time.

## Privacy note

`ip` is personal data under India's DPDP Act 2023 and the GDPR. The column has a
SQL comment saying so. If this goes beyond personal use, add a short notice
telling users what is collected before they submit.
