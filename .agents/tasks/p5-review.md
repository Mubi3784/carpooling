# Phase 5: Read-time matching engine, match endpoints and filters

The change adds a pure matching engine in `backend/utils/matching.js`, three read-only owner-only endpoints, strictly validated ride and request filters, and the passenger and driver match pages with a collapsed filter panel. Matching is computed at read time and nothing is stored. The coder's evidence (`p5-verification.md`) shows backend 188/188, frontend build, lint (0 errors) and 83/83 tests green. The suites were not re-run here, as instructed. The UI was not exercised in a browser.

Watch for: (1) different-vehicle ALTERNATIVE is capped at 120 min, a reading of the spec the coder flagged (confirmed in `matchRideToRequest`); (2) the counts endpoint is a lower bound past 300 candidate rides (confirmed, documented in code); (3) no browser check of the UI (confirmed from the evidence).

**Verdict**: APPROVED

## High-level view

The engine is pure and takes `now` as an argument. Thresholds are named exported constants (30/90/120). Candidate gates (same date, ACTIVE, read-time expiry, seats > 0, driver != passenger) run before any level logic. Bike and car rules follow the spec. A missing `vehicleType` is treated as CAR. A BIKE ride only takes count 1, a CAR ride compares `availableSeats`, and a vehicle mismatch can only be ALTERNATIVE.

The endpoints return 404 to non-owners, whitelist their output (first name only, no ids, no contact data), and look up existing matches with one batched query. The counts endpoint uses 2 queries however many requests the user has, so there is no N+1.

New filter params go through shared validators that reject arrays and objects, limit length and range, and regex-escape text. The frontend has level grouping, reason chips, a collapsed-by-default filter panel with `aria-expanded`, mode-aware visibility, empty states and the safety line.

<details>
<summary>Issues (3)</summary>

1. **Different-vehicle ALTERNATIVE time cap** (confirmed, non-blocking) — `matchRideToRequest` returns null past 120 min even when the vehicle differs. The spec text can be read as uncapped. Confirm the product intent. The cap is a one-line change.
2. **Counts are a lower bound past 300 rides** (confirmed, non-blocking) — `MAX_COUNT_CANDIDATES` is applied across all dates, sorted by time. Heavy dates could undercount. This is documented in code. Consider a per-date cap later.
3. **UI not exercised in a browser** (confirmed, non-blocking) — frontend behaviour is covered only by build, lint and pure-helper tests. Do a manual pass before release.

</details>

<details>
<summary>Details</summary>

### Level thresholds and the different-vehicle time cap

`matchRideToRequest` runs gates, then destination (required at every level), then capacity, then a hard `diff > ALTERNATIVE_TIME_WINDOW_MIN` rejection. EXACT needs the same vehicle, diff <= 30 and pickup `textMatches`. CLOSE needs the same vehicle, diff <= 90 and a shared pickup token. Everything else that survives is ALTERNATIVE. The rejection happens before the vehicle check, so a different-vehicle ride 3 hours away never appears (likely intentional, confirmed in code). The coder flagged this as a decision. If the spec means "different vehicle at any time", this is a deviation, so the product owner should confirm.

### Read-only, owner-only, no contact data

`getMatchesForRequest` and `getMatchingRequests` return 404 for a malformed id, a missing document or a non-owner. Both only call `find` and `lean`, with no writes. Rides are fetched with `-whatsappNumber`, the response is mapped to a whitelist, and drivers and passengers expose only a first name. The ride-side endpoint excludes the caller's own requests and uses the same whitelist as the browse view. Both return 200 with an empty list and a `reason` when the source is no longer open.

### Counts endpoint cost

`getMatchCounts` runs one query for the caller's active requests and one for candidate rides across the distinct dates, then matches in memory. The cap is 300 rides across all dates. If a busy day fills the cap, counts for later dates silently undercount. The cap is documented as a lower bound, which is acceptable for free-tier Atlas.

### Filter validation

`queryValidation.js` rejects non-strings (arrays and objects from `?x[$ne]=1`), enforces length 50, HH:mm times, and integers 1..6. `getRides` also checks timeFrom <= timeTo and ANDs the pickup and destination regexes through `$and` so the keyword `$or` survives. `getRequests` adds `passengers` and the `vehicle` alias, which must agree with `vehicleType`.

</details>

<details>
<summary>File map</summary>

- `backend/utils/matching.js`: engine, constants, filler list
- `backend/utils/queryValidation.js`: shared validators
- `backend/controllers/requestController.js`: matches, counts, filter additions
- `backend/controllers/rideController.js`: matching-requests, ride filters
- `backend/routes/*`: static routes registered before `/:id`
- `backend/tests/matching*.test.js`: unit and endpoint tests
- `frontend/src/utils/matches.js`, `pages/RequestMatches.jsx`, `pages/RideMatchingRequests.jsx`, `Feed.jsx`, `Requests.jsx`, `MyRides.jsx`, `MyRequests.jsx`, `App.jsx`: UI

Full diff: `git diff main` plus untracked files.

</details>
