# P0 verification

Command: `npm test` in `backend\` (runs `jest --runInBand`, Jest + supertest + mongodb-memory-server).
Result: 1 suite passed, 32 of 32 tests passed, 0 failed (17.6 s). Of these, 8 are new (P0 hardening group); the 24 existing tests pass, with the TTL test updated to expect the +05:00 offset.

New tests: PKT parsing (08:30 PKT stored as 03:30Z, expiresAt 03:45Z), past date rejected, object/array/invalid date query returns 400, regex keyword escaped and non-string keyword ignored, expired ride returns 404 from getRideById (owner too), updateSeats cap/integer/expired and FULL/ACTIVE consistency, login 429 after 10 attempts per IP (other IP unaffected), 500 responses do not leak internal error text.

Frontend: not changed (device-local Today/Tomorrow in `dateUtils.js` agrees with Asia/Karachi for users in Pakistan), so `npm run build` was not run.

Migration script `backend\scripts\migrate-shift-times.js`: syntax-checked only; not run (neither dry run nor --apply) because it needs the real MONGO_URI.
Run it from `backend\` (updated in P1, follow-up F-1): `node scripts/migrate-shift-times.js --before=<UTC deploy time>` (dry run, counts only), then `node scripts/migrate-shift-times.js --apply --before=<UTC deploy time>`. `--before` is the UTC instant the time zone fix went live; only rides with no `timeShiftedAt` and `createdAt < before` are shifted, and `--apply` is refused without it. New rides are stamped at creation.

Limitations: the auth rate limiter is in-memory, so counters are per serverless instance (best-effort on Vercel). Nothing was committed; no .env file was read or changed; no packages installed.
