# Vehicle type (Car/Bike) with P0 follow-ups F-1 and F-3

P1 adds a `vehicleType` (CAR/BIKE) to rides end to end, with no data migration: old documents read as CAR and the CAR filter is `$ne: 'BIKE'`. F-1 makes the time-shift migration safe to re-run by stamping `timeShiftedAt` at ride creation and requiring `--before` for `--apply`. F-3 limits trust of `x-forwarded-for` to Vercel. Code matches the stated requirements. Verification evidence (56/56 backend, 40/40 frontend, build, lint) was read and trusted; no suites were re-run. UI behavior was verified by build and code reading only, per the evidence file.

Watch for: the bike seat display is a `div` with `aria-disabled` and no role (possible, minor a11y); no browser check of the UI was done (confirmed in evidence); the migration dry-run against the real database has not been run (owner action).

**Verdict**: APPROVED

## High-level view

Vehicle type lives on the Ride model with an enum and a CAR default. Reads map it with `?? 'CAR'`, so legacy documents need no migration, and the filter avoids `{vehicleType:'CAR'}` for the same reason. A model `pre('validate')` hook repeats the bike seat invariant that the controller enforces.

The migration script is gated by a required `--before` cutoff plus a `timeShiftedAt` marker stamped on new rides and on applied rides. Dry run is the default, prints counts only, and error output withholds hostnames.

The rate limiter trusts the first `x-forwarded-for` hop only under `VERCEL`, falling back to the socket address. Outside Vercel behind a proxy all clients share the proxy IP, which makes the limiter coarser (documented, accepted).

The frontend adds a radio-group selector, a text-plus-icon badge, a Feed filter that passes `vehicleType` to the API, and a bike seat cap in MyRides.

<details>
<summary>Issues (1)</summary>

1. **Bike seat display semantics (possible, non-blocking)**: `aria-disabled="true"` on a plain `div` in OfferRide has no role, so it conveys little; the hint is linked by `aria-describedby`. Consider a read-only input or drop the attribute.

</details>

<details>
<summary>Details</summary>

## Bike seat handling split across controller, model and UI

The controller rejects BIKE with seats other than 1 (400) and stores 1 when omitted. The model hook rejects bike docs with `totalSeats !== 1` and any doc whose available seats exceed total. `updateSeats` caps bikes at 1 and cars at `totalSeats`. The UI mirrors this via `getMaxSeats`. Legacy docs are unaffected since the hook runs only on new or modified seat and type fields.

## Migration and rate limiter

`--apply` without `--before` exits 1 before connecting. The filter is `timeShiftedAt` absent and `createdAt < before`; rides lacking `createdAt` are never shifted and are reported. Tests for the non-Vercel limiter path exist per the evidence.

</details>

<details>
<summary>File map</summary>

Backend: `models/Ride.js` (field, index, hook), `controllers/rideController.js` (validation, filter, output, stamp), `middleware/rateLimiter.js`, `scripts/migrate-shift-times.js`, `tests/api.test.js`. Frontend: `utils/vehicle.js`, `components/VehicleBadge.jsx`, `OfferRide`, `RideCard`, `RideDetails`, `Feed`, `MyRides`, `tests/vehicle.test.js`. Full diff: `git diff`.

The diff also bundles unrelated P0 hardening (auth, roadStatus, dateHelpers, errorResponse) from the prior phase; out of scope here.

</details>
