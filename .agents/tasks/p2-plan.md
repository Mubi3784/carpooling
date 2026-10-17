# Implementation Plan: P2 Multi-day scheduling for driver rides

Root: `d:\Mubashir\carpooling\carpooling`. Backend `backend\`, frontend `frontend\`. PowerShell: use `;` not `&&`, `npm.cmd`. No new packages. No git commit. Never read or print `.env`.
Commands: backend `cd d:\Mubashir\carpooling\carpooling\backend; npm.cmd test` (jest --runInBand, mongodb-memory-server). Frontend `cd ...\frontend; npm.cmd test` (node --test tests/*.test.js), `npm.cmd run lint`, `npm.cmd run build`.

Decision on structure: not split into FEATs. Backend and frontend are one coupled contract (payload shape, series endpoints); run the existing implement-and-review loop with this plan. Verdict gate (if a loop is built): `d:\Mubashir\carpooling\carpooling\.agents\tasks\p2-review.json`, jsonPath `verdict`, value `APPROVED`.

## Decisions (with reasons)

- Constants live in a new `backend\utils\rideLimits.js`, exported: `MAX_ACTIVE_FUTURE_RIDES_PER_USER = 7` (the ONE cap constant), `MAX_DATES_PER_SUBMISSION = 6`, `SCHEDULE_WINDOW_DAYS = 13`. One file so P3 (passenger requests) reuses the same cap.
- `clientRequestId` is stored directly as `seriesId` (String, max 64). Accepted pattern `/^[A-Za-z0-9_-]{8,64}$/` (covers UUIDs). Uniqueness is per driver via the index, so another user sending the same id cannot collide with or read it.
- Cap rejection uses HTTP 409 (state conflict, not malformed input). Validation failures use 400.
- Replay: success on first create returns 201; resubmitting the same `clientRequestId` with nothing missing returns 200 with the existing series. If a prior attempt partly inserted (crash), the retry inserts only the missing dates.
- Legacy payload (`rideDate` only, no `dates`) is treated as `dates=[rideDate]`. If it has no `clientRequestId`, the doc gets no `seriesId` (stays legacy-shaped). If `dates` is present, `rideDate` is ignored.
- Cap race between two concurrent different-series requests is accepted (best effort, no transactions on free tier). Idempotency itself is exact (unique index).
- `DELETE /series/:seriesId` returns 404 for non-owners (query is scoped by `driver`, so existence is not leaked).
- Frontend uses browser-local dates (users are in Pakistan); the backend is the authority and re-validates in Asia/Karachi.

## Backend tasks

- [ ] 1. Add date helper and limits constants.
      Create `d:\Mubashir\carpooling\carpooling\backend\utils\rideLimits.js` with the three constants above. In `d:\Mubashir\carpooling\carpooling\backend\utils\dateHelpers.js` add and export `addDaysToDateString(yyyyMmDd, n)` (build `new Date(`${s}T00:00:00Z`)`, `setUTCDate(+n)`, return `toISOString().slice(0,10)`; pure calendar math, no time zone drift).
      Verify: `npm.cmd test` in backend still passes (existing 56 tests).

- [ ] 2. Model: add `seriesId` and the unique partial index in `d:\Mubashir\carpooling\carpooling\backend\models\Ride.js`.
      Field: `seriesId: { type: String, trim: true, maxlength: 64, index: false }` (no default, so legacy docs lack it). Exact index spec, placed after the existing indexes:
      ```js
      rideSchema.index(
        { driver: 1, seriesId: 1, rideDate: 1 },
        { unique: true, partialFilterExpression: { seriesId: { $type: 'string' } }, name: 'uniq_driver_series_date' }
      );
      ```
      Also add a non-unique helper index `{ driver: 1, status: 1, expiresAt: 1 }` for the cap count.
      Verify: new index test (task 6) shows both indexes via `Ride.collection.indexes()`.

- [ ] 3. Rewrite `createRide` in `d:\Mubashir\carpooling\carpooling\backend\controllers\rideController.js`.
      Keep all existing field/vehicle/seat/price/phone validation unchanged (runs once, then applies to every instance). Replace the single-date block (step 5 and 7) with:
      1. Resolve `dates`: if `req.body.dates !== undefined` it must be an Array, else 400 "Dates must be a list". Else if `rideDate` use `[rideDate]`. Else 400 required. Reject length 0 or > `MAX_DATES_PER_SUBMISSION` ("You can post up to 6 days at a time").
      2. Each must pass `isValidDateString` (400 "Invalid date: X"), no duplicates (400 "Duplicate dates are not allowed").
      3. `today = getTodayInAppTimeZone()`, `maxDate = addDaysToDateString(today, SCHEDULE_WINDOW_DAYS)`. `d < today` -> 400 "Date X is in the past"; `d > maxDate` -> 400 "Rides can only be scheduled up to 14 days ahead (until {maxDate})".
      4. Validate `departureTime` format once. For each date `createDepartureDateTime(d, departureTime)` must satisfy `isFutureDeparture` (existing 5-minute rule), else 400 naming the date.
      5. `clientRequestId`: if defined must be a string matching the pattern, else 400. `seriesId = clientRequestId` or undefined.
      6. If `seriesId`: `existing = await Ride.find({ driver, seriesId })`. Compute `missing = dates not in existing.rideDate`. If `missing` is empty return 200 `{ success:true, message:'Rides already created', replayed:true, data: seriesPayload(existing) }`.
      7. Cap: `active = await Ride.countDocuments({ driver, status: {$in:['ACTIVE','FULL']}, expiresAt: {$gt: new Date()} })`. If `active + missing.length > MAX_ACTIVE_FUTURE_RIDES_PER_USER` return 409 with message like "You can have at most 7 upcoming rides. You have {active}; this would add {n}. Cancel some rides first."
      8. Build one doc per missing date (own `rideDate`, `departureDateTime`, `expiresAt = calculateExpiration`, `availableSeats=totalSeats=seats`, `vehicleType`, `seriesId`, `timeShiftedAt: new Date()`) and `await Ride.insertMany(docs, { ordered: false })`. Wrap in try/catch: if `error.code === 11000` or `error.writeErrors` all code 11000 (concurrent double tap), re-query the series and return 200 replay. Other errors fall to `sendServerError`.
      9. Response 201: `{ success, message, data: { id, status, vehicleType, seriesId: seriesId ?? null, count, rides: [{ id, rideDate, departureTime, departureDateTime, status }] } }` where `id/status/vehicleType` are the first ride's (keeps the old single-ride client contract). `seriesPayload(rides)` builds the same shape for replay, sorted by `rideDate` ascending.
      Verify: backend jest (task 6).

- [ ] 4. Add `deleteRideSeries`, expose `seriesId` in `getMyRides`, in the same controller.
      `deleteRideSeries`: validate `req.params.seriesId` with the same regex (400), then `Ride.deleteMany({ driver: req.user._id, seriesId, expiresAt: { $gt: new Date() } })`; `deletedCount === 0` -> 404 "No upcoming rides found for this series"; else 200 `{ success, message, data: { deletedCount } }`. `getMyRides` mapping adds `seriesId: ride.seriesId ?? null`. `getRides`, `getRideById`, `updateSeats` and `deleteRide` are not changed (deleteRide already checks `ride.driver` vs `req.user._id`; confirm only and cover by test). Export `deleteRideSeries`.
      Do not touch WhatsApp output.

- [ ] 5. Route in `d:\Mubashir\carpooling\carpooling\backend\routes\rideRoutes.js`.
      Import `deleteRideSeries`. Register `router.delete('/series/:seriesId', protect, deleteRideSeries);` BEFORE `router.delete('/:id', ...)` (comment why).
      Verify: `npm.cmd test`.

- [ ] 6. Tests: add `describe('P2 multi-day scheduling', ...)` to `d:\Mubashir\carpooling\carpooling\backend\tests\api.test.js`, placed before the road status describe, following the `P1 vehicle type` pattern (`registerUser` with unique emails e.g. `p2a@carpool.test`, `p2b@carpool.test`; `formatLocalDate(n)` for dates; `post` helper; `Ride.deleteMany({ driver })` in `beforeEach` per driver to isolate cap tests). Use a `uuid()` helper (`crypto.randomUUID()`). Tests:
      1. 7 dates rejected (400, 0 docs created).
      2. Duplicate dates rejected (400).
      3. Date beyond today+13 (offset 14) rejected; today+13 accepted; past date (offset -1) rejected (400).
      4. Non-array `dates`, invalid calendar date (`2026-02-30`), invalid `clientRequestId` -> 400.
      5. Same-day departure less than 5 minutes ahead rejected for that date.
      6. 6 dates -> 201, 6 docs with the same `seriesId`, each `departureDateTime` equals `createDepartureDateTime(date, time)` (and `toISOString()` ends with the PKT-shifted hour, e.g. 09:00 PKT = 04:00Z), each `expiresAt` = departure + 15 min.
      7. Same `clientRequestId` resubmitted -> 200 `replayed:true`, doc count unchanged; two parallel `Promise.all` posts with one id -> count equals dates length (no duplicates).
      8. Partial replay: pre-insert 1 of 3 docs for the series via `Ride.collection.insertOne`, repost 3 dates -> 3 docs total.
      9. Cap: 5 existing + 2 new = OK (7); then 1 more -> 409; two submissions 4+4 -> second 409; expired rides (insert raw with past `expiresAt`) and other users' rides do not count; CANCELLED does not count, FULL does.
      10. Index test: `await Ride.init()`, indexes include `{driver:1,seriesId:1,rideDate:1}` with `unique:true` and `partialFilterExpression`; two legacy docs without `seriesId` for same driver/date insert fine.
      11. Delete one date (`DELETE /api/rides/:id`) leaves others; non-owner delete -> 403.
      12. `DELETE /api/rides/series/:seriesId` deletes only the owner's instances of that series (other series, legacy rides and another user's same-named series untouched); non-owner -> 404 and nothing deleted; unknown id -> 404; expired instances are not counted/deleted; invalid format -> 400; route is not captured by `/:id`.
      13. Legacy single `rideDate` payload still 201, doc has no `seriesId`; with `clientRequestId` also works and is idempotent.
      14. Vehicle rules per instance: BIKE with 3 dates -> every doc `totalSeats=1`, `availableSeats=1`, `vehicleType=BIKE`; BIKE with `availableSeats:3` -> 400; CAR seats per doc correct; invalid vehicleType -> 400.
      15. Search: with rides on today+1 and today+2 in one series, `GET /api/rides?date=<today+1>` returns only that date's instance (correct `rideDate`/`departureDateTime`); the other date's search returns the other; legacy rides still listed.
      16. `GET /api/rides/my-rides` returns `seriesId` (string for series rides, `null` for legacy); `PATCH /:id/seats` on one instance changes only that instance.
      Verify: `cd backend; npm.cmd test` all green (56 existing plus new).

## Frontend tasks

- [ ] 7. API helpers in `d:\Mubashir\carpooling\carpooling\frontend\src\services\api.js`.
      Add named exports (keep `export default api`): `createRides(payload)` -> `api.post('/rides', payload)`, `deleteRide(id)` -> `api.delete(`/rides/${id}`)`, `deleteRideSeries(seriesId)` -> `api.delete(`/rides/series/${encodeURIComponent(seriesId)}`)`.

- [ ] 8. Pure scheduling utils plus tests.
      Create `d:\Mubashir\carpooling\carpooling\frontend\src\utils\scheduling.js` (ESM, no React, so `node --test` can import it like `vehicle.js`): constants `MAX_DATES = 6`, `WINDOW_DAYS = 13`; `createClientRequestId()` (`crypto.randomUUID` if present, else a fallback built from `crypto.getRandomValues` or `Date.now()`+`Math.random()` hex, matching `/^[A-Za-z0-9_-]{8,64}$/`); `getSelectableDates(startDate, now)` returns `startDate..today+13` (uses `getDateStringWithOffset` and `formatDateToYYYYMMDD` from `dateUtils.js`; start clamped to today..today+13); `formatDateChip(yyyyMmDd)` -> `{ weekday: 'Mon', label: '12 May' }` (parse with `new Date(y, m-1, d)`, `toLocaleDateString('en-GB', ...)`); `toggleDate(selected, date, maxCount)` (no-op past max, keeps sorted); `groupRidesBySeries(rides)` -> array of `{ key, seriesId|null, rides[] }`: rides sharing a non-null `seriesId` AND count >= 2 form one group (rides sorted by `rideDate`/`departureTime` ascending); everything else is a single-ride group; groups ordered by their earliest ride.
      Create `d:\Mubashir\carpooling\carpooling\frontend\tests\scheduling.test.js` (`node:test` + `assert`, same style as `tests\vehicle.test.js`): id format and uniqueness; selectable range is capped at today+13; toggle respects max 6; grouping (series with 3, series reduced to 1 renders single, legacy with null, mixed order).
      Verify: `cd frontend; npm.cmd test` passes.

- [ ] 9. `d:\Mubashir\carpooling\carpooling\frontend\src\pages\OfferRide.jsx`: multi-day control.
      Keep all existing styling and the section layout. In "2. Date & Departure Time": add a "How many days?" stepper (1..6, same +/- style as the seat stepper; default 1), a start-date input (`min=todayStr`, `max=today+13`, replaces `rideDate` input), and a chips grid (`role="group"`, each chip a `<button type="button" aria-pressed>` with min height 44px showing weekday + date, built from `getSelectableDates`). State: `dayCount`, `startDate`, `selectedDates` (init `[todayStr]`). Changing start date resets selection to `[startDate]`; lowering `dayCount` trims the latest dates; chips beyond `dayCount` are disabled once the count is reached; helper text "Select N day(s) (X chosen)". Below the chips show a summary list of the selected dates with weekday + date. `clientRequestId` created once with `useState(() => createClientRequestId())` (or `useRef`) and reused on every submit/retry. Validation: selected count must equal `dayCount` ("Please select N date(s)"), else friendly error. Submit sends `{ ...formData minus rideDate, dates: selectedDates, clientRequestId, vehicleType, availableSeats, pricePerSeat }` via `createRides`. Keep `loading` guard: early return if already `loading` in `handleSubmit` and button `disabled={loading}`; button label shows "Publishing Rides..." for count > 1. Error display: use `err.response?.data?.message`; network errors (use `isNetworkError` from `..\utils\networkError`) show "No connection. Tap Publish again to retry; it will not create duplicates." On success `navigate('/my-rides')`.
      Verify: `npm.cmd run lint; npm.cmd run build; npm.cmd test` in frontend.

- [ ] 10. `d:\Mubashir\carpooling\carpooling\frontend\src\pages\MyRides.jsx`: grouped series.
      Compute `groups = groupRidesBySeries(rides)` (useMemo). Single-ride groups render the existing card unchanged. Series groups render one card: route, `VehicleBadge`, time, price, a "N days" label, then one row per date: weekday + date, status chip, seat +/- (existing `handleUpdateSeats`, per ride), and a per-date "Cancel" button using the existing delete modal. Header-level "Cancel all dates" button opens the same `ConfirmationModal` with a second state `seriesToDelete` (message: "Cancel all N upcoming dates of the ride from X to Y? They will be permanently removed."), confirm calls `deleteRideSeries(seriesId)` then removes those rides from state (or refetches with `fetchMyRides`). Reuse `deleteLoading`. Keep existing modal for single ride delete (`rideToDelete`); modal `title`/`message`/`confirmText` switch on which target is set. Seat controls remain per date; `getMaxSeats(ride)` unchanged. Adjust the `getMyRides` sort: the API returns departure descending; the grouping utility sorts ascending inside groups.
      Verify: `npm.cmd run lint; npm.cmd run build; npm.cmd test`.

## Final verification (coder runs all, records evidence)

1. `cd d:\Mubashir\carpooling\carpooling\backend; npm.cmd test` all green.
2. `cd d:\Mubashir\carpooling\carpooling\frontend; npm.cmd test; npm.cmd run lint; npm.cmd run build` all pass.
3. Note anything not verifiable (no browser run of the new UI; no real DB index build check beyond mongodb-memory-server).
4. Regression checks to confirm in the existing tests: Today/Tomorrow/custom-date feed tests, P1 vehicle tests, P0 tests unchanged and passing.
5. Out of scope: WhatsApp behavior (P4), passenger requests (P3), TTL changes, migration scripts.

## Notes for the implementer

- Existing mapping helpers: `getVehicleType` in the controller; keep use for legacy docs.
- `Ride.init()` must be awaited in tests before asserting unique-index behavior (see P1 index test).
- Unique-index duplicate errors from `insertMany({ordered:false})` surface as `MongoBulkWriteError` (`error.code === 11000` or `error.writeErrors[].err.code`); handle both shapes.
- No existing frontend test infra beyond `node --test` on pure modules; do not add component tests.
