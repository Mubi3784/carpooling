# Multi-day driver ride scheduling (P2)

Driver rides can now be posted for 1 to 6 dates in one request. The backend creates one ride per date, with its own departureDateTime, expiresAt and seats. `clientRequestId` doubles as `seriesId`, so retries are idempotent through a partial unique index. `DELETE /api/rides/series/:seriesId` cancels a whole series, and the frontend gets a date picker and a grouped My Rides view. The single `rideDate` payload still works.

Watch for: the frontend was verified only by build, lint and unit tests, not in a browser (confirmed, p2-verification.md). The cap race between concurrent different-series requests is best effort (confirmed, accepted in the plan). The controller was rebuilt after a truncation (confirmed in the notes), but the diff shows the untouched handlers match the original.

**Verdict**: APPROVED

## High-level view

Validation is strict and runs before any write. Dates must be 1..6, unique, real calendar dates, within today..today+13 in Asia/Karachi, and each must pass the 5-minute future rule. A legacy `rideDate` is wrapped into a one-element list, so old clients keep working.

Idempotency relies on the unique partial index `{driver, seriesId, rideDate}`, which applies only where seriesId is a string. The controller pre-filters dates that already exist and uses `insertMany` with `ordered:false`. A duplicate-key error turns into a replay of the existing series. Legacy rides without a seriesId are exempt from the index.

The cap is the single constant `MAX_ACTIVE_FUTURE_RIDES_PER_USER = 7`. It counts the driver's ACTIVE and FULL rides with `expiresAt > now` and rejects with 409 if `active + missing > 7`. Replays are not counted against the cap.

The series delete route is registered before `/:id`. It is scoped to the owner, a non-expired `expiresAt`, and the seriesId, so other users' series look like 404. `deleteRide` is unchanged, so it stays owner-only and single-date. `getMyRides` returns `seriesId`. Search eligibility still uses the existing status and expiresAt queries and does not depend on TTL. WhatsApp is untouched.

The frontend generates `clientRequestId` once per mount with `useState`, so it is reused on retry. Submit is disabled while loading. The date picker is bounded by min/max, and MyRides groups by series with per-date Cancel, Cancel all dates, and per-ride seat controls.

<details>
<summary>Issues (2)</summary>

1. **Cap check is not atomic (confirmed, non-blocking)**: two concurrent different-series requests can exceed 7. This was accepted in the plan. If it matters, enforce the cap with a per-user counter later.
2. **UI not exercised in a browser (confirmed, non-blocking)**: do a manual pass on the mobile date picker and the My Rides grouping before release.

</details>

<details>
<summary>Details</summary>

## Replay and partial-series behaviour

Retrying with a subset or superset of the original dates creates only the missing dates. A full duplicate returns 200 with `replayed:true`. A duplicate-key error from a concurrent retry also falls back to returning the existing series. The cap is checked against only the missing dates, so replays after hitting the cap still succeed.

## Cap semantics

The count includes only ACTIVE and FULL rides with `expiresAt > now`, and applies to rides on all scheduled dates. The `{driver, status, expiresAt}` index supports the query. The passenger-request side of the symmetry does not exist yet in this phase.

</details>

<details>
<summary>File map</summary>

- backend/controllers/rideController.js: multi-date create, idempotency, cap, series delete
- backend/models/Ride.js: seriesId, partial unique index, cap index
- backend/routes/rideRoutes.js: series delete route before /:id
- backend/utils/rideLimits.js: named limits
- backend/utils/dateHelpers.js: Karachi date helpers
- backend/tests/api.test.js: 15 new P2 tests (71 pass per evidence)
- frontend/src/utils/scheduling.js, pages/OfferRide.jsx, pages/MyRides.jsx, services/api.js: UI
- frontend/tests/scheduling.test.js: 5 new tests

Full diff: `git diff`

</details>
