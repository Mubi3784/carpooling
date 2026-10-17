# P1 Gate (Stage 0) - Vehicle Type Re-verification

Result: GATE: PASS

## Automated results (real runs, this session)

| Check | Command | Result |
|---|---|---|
| Backend tests | `npm.cmd test` (backend, jest --runInBand) | 56 passed, 0 failed (1 suite), exit 0. Includes 14 "P1 vehicle type" tests |
| Frontend build | `npm.cmd run build` | Success, 1981 modules, exit 0 |
| Frontend lint | `npm.cmd run lint` (oxlint) | 0 errors, 14 warnings, exit 0 (unused imports and react immutability/exhaustive-deps notes; none from P1 logic) |
| Frontend tests | `npm.cmd test` (node --test) | 40 passed, 0 failed, exit 0. Includes 3 vehicle util tests |

## Backend P1 coverage (from the passing jest tests)
- Missing vehicleType defaults to CAR; BIKE stores 1 seat; bike with >1 seat is rejected (400).
- Invalid vehicleType on create (TRUCK, lowercase, null, number, array, object) returns 400.
- Bike seats cannot exceed 1 through updateSeats, including corrupt data.
- Legacy rides without the field are treated as CAR in feed, details, my-rides.
- Feed `vehicleType=CAR|BIKE` filter works with date and keyword; invalid or operator-injection values return 400; empty value means All.
- Every ride output includes vehicleType; compound vehicle index exists; WhatsApp masking unchanged for bikes.

## Code inspection (frontend)
- OfferRide.jsx: selecting BIKE sets availableSeats to 1, hides the +/- selector (fixed 1-seat display), and submit forces 1 for bikes. CAR keeps the 1..6 stepper, restoring 3 when switching back from bike.
- RideCard, RideDetails, MyRides render `VehicleBadge` (icon + visible text) using normalized type (missing = CAR). MyRides caps seat increase via `getMaxSeats`.
- Feed.jsx: All/Car/Bike buttons (aria-pressed) append `&vehicleType=` to the `date=` query; refetch on date or vehicle change, with out-of-order response guard.

## What was NOT verified
- No browser/UI automation tool was available in this environment, so the Offer Ride, badge display and Feed filter + Today/Tomorrow/custom date flows were NOT exercised in a live browser. P1 was verified by build, lint, unit/integration tests and code inspection only. The backend API behavior for the filter and date combination is covered by the jest tests.
- Dev servers for backend and frontend were already running on the machine (not started by this gate); they were left untouched.

## Notes
- The shell tool returned garbled output for foreground commands, so runs were executed in a hidden background process writing to log files, then read back. Temp logs were removed.
