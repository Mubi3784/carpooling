# P1 verification

Nothing was committed, no packages added, no .env read or printed.

## Commands run and results
- `npm test` in `backend\` (jest, Jest + supertest + mongodb-memory-server): 1 suite passed, 56 of 56 tests passed, 0 failed (11 s). Before this phase: 32. New: 24 (5 rate limiter IP, 5 migration safety, 14 P1 vehicle type). The existing login rate-limit test now sets `VERCEL=1` temporarily because it relies on `X-Forwarded-For`.
- `npm run build` in `frontend\`: passed (vite build, PWA generated).
- `npm run lint` in `frontend\` (oxlint): 0 errors, warnings only. My changes add none new except the same existing "fetchRides read before initialization" pattern in `Feed.jsx` (already present before). The unused-import warnings (Calendar, DollarSign, Phone, FileText, Users, AlertCircle, Car in Home) were pre-existing.
- `npm test` in `frontend\` (node --test): 40 of 40 passed, including 3 new tests in `tests\vehicle.test.js`.
- `node --check scripts/migrate-shift-times.js`: exit 0.
- `node scripts/migrate-shift-times.js --apply` (no `--before`): exit 1, prints the "Refusing to --apply without --before=..." message, does not connect or read .env.

## UI verification
No browser or dev server check was done. Offer Ride Bike behavior, the Feed filter, badges and the MyRides seat cap were verified by build and code review only.

## P0 follow-ups
- F-1: `createRide` stamps `timeShiftedAt` (new optional field in `Ride.js`). The migration script now requires `--before=<ISO UTC>` for `--apply`, shifts only rides with no `timeShiftedAt` and `createdAt < before`, prints counts only, and prints no raw error messages. Usage:
  - `node scripts/migrate-shift-times.js` (dry run, counts only)
  - `node scripts/migrate-shift-times.js --before=2026-05-20T10:00:00Z` (dry run with cutoff)
  - `node scripts/migrate-shift-times.js --apply --before=2026-05-20T10:00:00Z`
  `--before` is the UTC instant the P0 time zone fix went live (Vercel deployment creation time in UTC). The real-database dry run has NOT been executed; the owner must run it and compare counts before `--apply`.
- F-3: `x-forwarded-for` is trusted only when `process.env.VERCEL` is set. Elsewhere the limiter uses `req.socket.remoteAddress`, then `req.ip`. Self-hosted or proxied deployments therefore see the proxy address, so the limiter is coarser there.

## P1 behavior
- `vehicleType` enum CAR/BIKE, default CAR on new docs. Old docs have no field and read as CAR with no data migration (`ride.vehicleType ?? 'CAR'` in getRides, getRideById, getMyRides, updateSeats).
- Filter: CAR uses `{ $ne: 'BIKE' }`, BIKE uses `'BIKE'` (never `'CAR'`). `GET /rides?vehicleType=` accepts only the strings CAR or BIKE (empty string means no filter), otherwise 400.
- Create: invalid vehicleType 400; missing means CAR; bike with seats other than 1 gives 400, omitted seats store 1. Car keeps 1..6. updateSeats caps bikes at 1, cars at `totalSeats`. A `pre('validate')` hook in the model enforces the same invariants.
- New compound index `{ status, vehicleType, rideDate, departureDateTime }`; TTL and old index untouched (tested).
- WhatsApp behavior unchanged (tested). `carDetails` unchanged; the UI labels it "Vehicle details" for bikes on RideDetails.

## Files changed
Backend: `middleware\rateLimiter.js`, `models\Ride.js`, `controllers\rideController.js`, `scripts\migrate-shift-times.js`, `tests\api.test.js`.
Frontend: `src\utils\vehicle.js` (new), `src\components\VehicleBadge.jsx` (new), `tests\vehicle.test.js` (new), `src\pages\OfferRide.jsx`, `src\components\RideCard.jsx`, `src\pages\RideDetails.jsx`, `src\pages\Feed.jsx`, `src\pages\MyRides.jsx`.
Docs: `.agents\tasks\p0-verification.md` (migration usage), `.agents\tasks\two-sided-carpooling-plan.md` (P0/P1 status), this file.
