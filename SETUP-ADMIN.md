# Admin panel

Lives at **`/admin`** on the deployed site (e.g. `https://your-site.netlify.app/admin`).
Sign in, then view, create, edit and delete catch reports — single rows or a
selected batch.

## The one thing that actually protects it

The login form in the browser is a **convenience, not the security boundary**.

Every request carries HTTP Basic credentials, and
[netlify/functions/admin.mjs](netlify/functions/admin.mjs) verifies them
server-side on **every single call**. That distinction matters: a password
checked in React would be readable in the public JavaScript bundle, and the API
would still be wide open — `curl -X POST /api/admin -d '{"action":"delete","ids":[1]}'`
would wipe rows without ever loading the login screen.

So the credentials live in environment variables and are never in the bundle,
never in this repo.

> [!IMPORTANT]
> **There is no default password.** If `ADMIN_USER` or `ADMIN_PASSWORD` is unset,
> every admin request returns `503 admin_not_configured`. That is deliberate: a
> default committed to a public repo is the same as no password at all.

## Setup

**1. Netlify → Site configuration → Environment variables**

| Key | Value |
|---|---|
| `ADMIN_USER` | your username |
| `ADMIN_PASSWORD` | a long random password — tick **"Contains secret values"** |

**2. Redeploy.** Environment variables are only read at build time.

**3. Locally**, put the same two in `.env` (gitignored) and run `npm run dev:api`.
Plain `npm run dev` does not run functions, so the panel will report that the
admin API is not running.

## What the admin can do

| Action | Notes |
|---|---|
| **List** | every column, including the `ip` recorded on public submissions |
| **Create** | a new report; `catch_type` defaults to `fish`, quantity to 0 |
| **Edit** | any writable column |
| **Delete** | one row, or every selected row, behind a confirm |

Both a **table view** (with selection checkboxes and bulk delete) and a **chart
view** are available, the same line chart the public analysis uses.

## What the admin deliberately cannot do

`id`, `created_at` and `ip` are **not writable**. The function keeps an allowlist
of editable columns and silently drops anything else, so a crafted request cannot
forge a source IP or renumber a row. A request that tries only those fields comes
back `nothing to update`.

`catch_type` must be `fish`, `crab` or `other`, and `quantity_kg` must be 0–1000 —
the same constraints the public form and the database enforce, applied again here
so the admin cannot create a row the rest of the app would choke on.

## Security notes worth reading once

**The password is only as good as you choose.** It is compared in constant time
(both sides SHA-256'd first so the digests are equal length, since a length
mismatch would itself leak information), and username and password are both
checked regardless of whether the first matched, so the response time does not
reveal which half was wrong. None of that helps against a guessable password.
Something long and random beats something memorable — this endpoint can delete
your entire dataset.

**There is no rate limiting.** Netlify Functions are stateless, so nothing here
slows down repeated guesses. If the panel is ever more than a personal tool, put
it behind Netlify Identity or add a lockout backed by a table.

**The panel exposes IP addresses**, which are personal data under India's DPDP
Act 2023 and the GDPR. That is defensible for the data owner looking at their own
collection, and it is the only place in the app where they are shown — the public
analysis dashboard never receives them.

## Troubleshooting

| Response | Meaning |
|---|---|
| `503 admin_not_configured` | `ADMIN_USER` / `ADMIN_PASSWORD` unset — set them and redeploy |
| `503 database_not_configured` | `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` unset |
| `401 auth_required` | no `Authorization` header reached the function |
| `401 bad_credentials` | wrong username or password |
| "The admin API is not running" | you are on `npm run dev`; use `npm run dev:api` |
