# Phase 0 hardening: Pakistan time zone, input validation, auth rate limiting, safe errors

P0 parses ride times as Asia/Karachi (+05:00) through one constant, computes "today" in that zone, validates `getRides` query input, adds a read-time expiry check, tightens `updateSeats`, adds a dependency-free in-memory limiter on login/register, stops leaking raw error text, and ships a dry-run-by-default migration for old ride times. The plan doc gains a FINAL DECISIONS section and section 11 is marked resolved. Every P0 requirement I checked is present in the code. The coder's evidence reports 32/32 tests passing (8 new) with no frontend change and no new packages; I did not re-run anything.

Watch for: the migration's `timeShiftedAt` guard does not protect rides created after the fix, so a second `--apply` would shift them wrongly (confirmed, non-blocking). The migration was never executed, even as a dry run (confirmed).

**Verdict**: APPROVED

## High-level view

Time handling is centralised in `dateHelpers.js`: one offset constant, a Karachi-based "today", and a strict date-string validator reused by `createRide` and `getRides`. The 5-minute future rule and 15-minute grace period are unchanged.

Read paths are hardened. `getRides` rejects non-string or non-calendar dates with 400 and escapes and truncates keywords. `getRideById` and `updateSeats` both return 404 once `expiresAt` has passed, and `updateSeats` enforces integer seats in 0..totalSeats with FULL/ACTIVE derived from the value. Owners are not special-cased on `getRideById`, and WhatsApp exposure is untouched, as P4 expects.

Rate limiting and error handling are small and self-contained. The limiter is keyed on the first `x-forwarded-for` entry and documented as best-effort per serverless instance. Controllers go through `sendServerError`, and the global handler hides 5xx text in production.

The migration shifts `departureDateTime` and `expiresAt` by -5h with a single aggregation-pipeline update. Its safety depends on the operator running `--apply` exactly once.

<details>
<summary>Issues (3)</summary>

1. **Migration re-run hazard** (confirmed, non-blocking) — the `timeShiftedAt` filter only skips already-migrated rides. Rides created after deploy lack the field, so a second `--apply` would shift them by -5h. Either stamp new rides with `timeShiftedAt` at creation, or add a cutoff such as `createdAt < deploy time` to the filter.
2. **Migration unexecuted** (confirmed, non-blocking) — only a syntax check was done. Run the dry run against the real DB before `--apply` and compare the counts.
3. **Spoofable client IP outside Vercel** (possible, non-blocking) — the limiter trusts the first `x-forwarded-for` value. Vercel overwrites the header, but a self-hosted deployment without a trusted proxy could be bypassed by rotating the header. Document it, or only trust the header when `process.env.VERCEL` is set.

</details>

<details>
<summary>Details</summary>

## Migration idempotency covers only legacy rows

The filter is `{ timeShiftedAt: { $exists: false } }` and `$$NOW` is written on apply. That makes a repeated run harmless only while no new rides exist. After the fix is deployed, `createRide` stores correct UTC without `timeShiftedAt`, so rerunning `--apply` would move those rides five hours early. The header comment says "run at most once", which is the only protection. The script also prints `err.message` on failure, and driver connection errors can include host names, though not the credentials in the URI. The URI itself is never printed.

## Limiter keyed on forwarded header

```
client -> Vercel edge (sets x-forwarded-for) -> function -> limiter(Map per instance) -> controller
```

Per-instance counters mean an attacker spread across warm instances gets more than 10 attempts per 15 minutes. The coder documented this in the code and in the verification notes, which matches the requirement. The limiter runs after the DB-connect middleware, so blocked requests still pay for a connection check. This is minor.

## Coverage

Tests cover PKT parsing and expiry, the 400 paths for object, array and invalid dates, regex escaping, owner and non-owner 404 after expiry, seat bounds and FULL/ACTIVE consistency, 429 per IP with a second IP unaffected, and non-leaking 500s. Not tested: register limiter specifically, the migration script, the midnight boundary of `getTodayInAppTimeZone` (UTC late evening vs Karachi next day).

</details>

<details>
<summary>File map</summary>

- `.agents/tasks/two-sided-carpooling-plan.md`: FINAL DECISIONS section, section 11 resolved, supersede notes
- `backend/utils/dateHelpers.js`: +05:00 constant, Karachi today, date validator
- `backend/controllers/rideController.js`: validation, expiry checks, seat rules, safe errors
- `backend/utils/errorResponse.js`: shared safe error responder
- `backend/middleware/rateLimiter.js`: in-memory limiter
- `backend/routes/authRoutes.js`: limiters on login and register
- `backend/server.js`: production-safe global error handler, test-mode listen skip
- `backend/scripts/migrate-shift-times.js`: dry-run-first migration
- `backend/tests/api.test.js`: 8 new tests, TTL test updated

Full diff: `git diff` in `d:\Mubashir\carpooling`.

</details>
