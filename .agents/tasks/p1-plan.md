# P1 Implementation Plan: Vehicle type (Bike / Car) + P0 follow-ups

Project root: `d:\Mubashir\carpooling\carpooling` (backend `backend\`, frontend `frontend\`). Windows PowerShell: chain with `;`, not `&&`.

Hard rules for the implementer:
- Do NOT `git commit`. Do NOT add packages (lucide-react already ships the `Bike` icon; checked `bike.mjs` exists in `frontend\node_modules`).
- Do NOT read or print `.env` values. Refer to secrets by key name only (`MONGO_URI`).
- Do NOT change WhatsApp behavior (P4) and do NOT change the semantics of `carDetails` (for bikes it holds bike details; the UI label is "Vehicle details").
- Backend tests: `cd backend; npm test` (jest, `--runInBand`, in-memory MongoDB; first run may download the Mongo binary). Frontend: `npm run build`, `npm run lint` (oxlint, exists), `npm test` (`node --test tests/*.test.js`).
- Match existing style: CommonJS, 2-space indent, single quotes, `sendServerError` for 500s, `{ success: false, message }` for 4xx, Tailwind classes like the surrounding JSX.

## Decisions (with rationale)

1. F-1 does BOTH fixes: stamp new rides with `timeShiftedAt` at creation AND require `--before=<ISO UTC>` for `--apply`. Stamping protects future rides automatically. The cutoff protects rides created after the P0 time zone fix but before the stamp shipped (they have no stamp but already hold correct UTC).
2. F-3: trust `x-forwarded-for` only when `process.env.VERCEL` is set. Read the env at call time (not module load) so tests can toggle it.
3. Rate-limiter tests for the non-Vercel path are unit tests on `getClientIp` / the middleware with fake `req` objects, not HTTP tests. Reason: HTTP tests without `X-Forwarded-For` all share one socket address and would exhaust the shared per-route login/register counters used by other tests.
4. Vehicle validity is strict: `vehicleType` must be exactly the string `'CAR'` or `'BIKE'` (case-sensitive). Only `undefined` means "missing => CAR". `null`, `''`, lowercase, arrays and objects get 400 on create. On `GET /rides`, an empty string `?vehicleType=` is treated as "no filter" (same as the existing `date` handling), anything else non-valid is 400.
5. Bike seats on create: bike requests may omit `availableSeats`/`totalSeats` (stored as 1). If either is sent and `Number(value) !== 1` the API returns 400. The frontend always sends `availableSeats: 1` for bikes.
6. Schema-level safety net: a `pre('validate')` hook on `Ride` rejects BIKE with `totalSeats !== 1` or `availableSeats > 1`, and any ride with `availableSeats > totalSeats`. It runs only when the doc is new or `availableSeats`/`totalSeats`/`vehicleType` is modified, so old rows saved elsewhere are not blocked.
7. `MyRides` seat "+" limit: bike => 1; car => `ride.totalSeats` (falls back to 6). This follows the backend rule `availableSeats <= totalSeats` and the "do not assume equal capacity" decision. The `-` button and its tooltip stay as they are.
8. Shared frontend helpers: new `frontend\src\utils\vehicle.js` (pure, unit-testable with `node --test`) and new `frontend\src\components\VehicleBadge.jsx` (used by RideCard, RideDetails, MyRides).

---

## Part A: P0 follow-ups (do first)

- [ ] 1. F-3: restrict `x-forwarded-for` trust to Vercel and export `getClientIp`.
      Edit `getClientIp` in `backend\middleware\rateLimiter.js`:
      ```js
      const getClientIp = (req) => {
        // Only Vercel overwrites x-forwarded-for; elsewhere the header is client-controlled.
        if (process.env.VERCEL) {
          const forwarded = req.headers['x-forwarded-for'];
          if (typeof forwarded === 'string' && forwarded.length > 0) {
            const first = forwarded.split(',')[0].trim();
            if (first) return first.slice(0, 64);
          }
        }
        return req.socket?.remoteAddress || req.ip || 'unknown';
      };
      ```
      Update the top-of-file comment (explain the VERCEL condition and that self-hosting behind a proxy needs `trust proxy`/another approach). Change the export to `module.exports = { createRateLimiter, getClientIp };`.
      In `backend\tests\api.test.js`, edit the existing test `login is rate limited per IP (429 after 10 attempts)`: set `process.env.VERCEL = '1'` at the start and restore the previous value in a `finally` (the test relies on `X-Forwarded-For`). Then add a new `describe('P0 follow-up: rate limiter client IP', ...)` with these tests (use fake req objects, `afterEach` restores `process.env.VERCEL`; `const { createRateLimiter, getClientIp } = require('../middleware/rateLimiter')` inside the tests or after `beforeAll`):
        - `ignores x-forwarded-for when VERCEL is not set`: `delete process.env.VERCEL`; `getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '10.0.0.5' } })` equals `'10.0.0.5'`.
        - `uses the first x-forwarded-for entry when VERCEL is set`: header `'1.2.3.4, 5.6.7.8'` gives `'1.2.3.4'`; a header longer than 64 chars is truncated to 64.
        - `falls back to req.ip then 'unknown'`: no socket => `req.ip`; neither => `'unknown'`.
        - `rotating x-forwarded-for does not bypass the limiter off Vercel`: `delete process.env.VERCEL`; `const mw = createRateLimiter({ windowMs: 60000, max: 2, message: 'Too many attempts.' })`; call it 3 times with fake `req` (`headers` with a different XFF each time, same `socket.remoteAddress`), a fake `res` (`set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn()`), and `next = jest.fn()`. Expect `next` called twice and `res.status` called with 429 on the third.
        - `separate clients are counted separately on Vercel`: `process.env.VERCEL = '1'`; same `max: 2` limiter; three calls from XFF `9.9.9.1` then one from `9.9.9.2`; expect the last call reaches `next`.
      Files: `backend\middleware\rateLimiter.js`, `backend\tests\api.test.js`
      Verify: `cd backend; npm test` — all prior tests plus the new rate-limiter tests pass.

- [ ] 2. F-1: stamp new rides with `timeShiftedAt` and harden the migration script. (Depends on nothing from item 1, but edit `Ride.js` here before item 3.)
      a) `backend\models\Ride.js`: add an optional field after `expiresAt`:
      ```js
      // Set on creation (rides made after the P0 time zone fix already hold correct UTC)
      // and by scripts/migrate-shift-times.js. Lets the migration skip already-correct rides.
      timeShiftedAt: {
        type: Date,
      },
      ```
      b) `backend\controllers\rideController.js` `createRide`: add `timeShiftedAt: new Date(),` to the `Ride.create({...})` object. Do not add it to any response mapper.
      c) Rewrite `backend\scripts\migrate-shift-times.js` (keep dry-run default, `SHIFT_MS`, the aggregation-pipeline `updateMany`, and `$$NOW` stamp):
        - Move `dotenv.config()` inside `run()` (after argument validation) so `require()`-ing the file for tests has no side effects and `.env` is not read when arguments are invalid.
        - Export `{ parseArgs, buildFilter, SHIFT_MS }` and only call `run()` when `require.main === module`.
        - `parseArgs(argv, now = Date.now())` returns `{ apply, before }` where `before` is a `Date` or `null`. Parse `--apply` and `--before=<value>`. `--before` must match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/`, must produce a valid `Date` (invalid calendar dates like `2026-02-31` fail), and must not be later than `now`. Throw `new Error(...)` with a short safe message otherwise (messages must name the flag, never print env values). `--apply` without a valid `--before` throws: `Refusing to --apply without --before=<ISO UTC deploy time of the P0 time zone fix>`.
        - `buildFilter(before)`: `{ timeShiftedAt: { $exists: false } }` plus `createdAt: { $lt: before }` when `before` is set.
        - `run()`: parse args first (on error print the message and `process.exit(1)`); then check `MONGO_URI` is set (print only "MONGO_URI is not set."); connect with `{ serverSelectionTimeoutMS: 10000 }`; print counts only: total, already stamped (skipped), pending to shift (matches `buildFilter(before)`), and when `before` is set: unstamped but created at/after the cutoff (skipped) and unstamped with no `createdAt` (skipped, never shifted). Print the cutoff as an ISO string. Without `--before`, print a warning that the count includes every unstamped ride and that `--apply` will be refused. Dry run prints "DRY RUN: no changes made".
        - Error handling: the final `.catch` prints `Migration failed (<err.name>). Details withheld to avoid printing host names or the connection string.` and never `err.message`. Disconnect in a try/catch and `process.exit(1)`.
        - Header comment: update Usage to
          ```
          node scripts/migrate-shift-times.js                                   # DRY RUN, counts only
          node scripts/migrate-shift-times.js --before=2026-05-20T10:00:00Z     # DRY RUN with the cutoff applied
          node scripts/migrate-shift-times.js --apply --before=2026-05-20T10:00:00Z
          ```
          State: `--before` is the UTC instant the P0 time zone fix went live (use the Vercel deployment creation time converted to UTC); only rides with NO `timeShiftedAt` AND `createdAt < before` are shifted; new rides are stamped at creation; applying twice is safe because applied rides get `timeShiftedAt`; `--apply` is refused without `--before`; always run the dry run first and compare counts; output never includes the connection string.
      d) Update the migration notes in `.agents\tasks\p0-verification.md` (the "Run it from backend" paragraph) to the new usage, and repeat it in the new `p1-verification.md` (item 12). Remove the sentence that says re-running is safe without a cutoff.
      e) In `backend\tests\api.test.js` add `describe('P0 follow-up: migration safety', ...)`, `const migrate = require('../scripts/migrate-shift-times')` inside the tests:
        - `parseArgs refuses --apply without --before`: `expect(() => migrate.parseArgs(['--apply'])).toThrow(/--before/)`.
        - `parseArgs rejects invalid or future --before`: `--before=yesterday`, `--before=2026-02-31T00:00:00Z`, `--before=2026-05-20T10:00:00+05:00` (not UTC `Z`), and a timestamp one day in the future each throw.
        - `parseArgs defaults to dry run`: `parseArgs([])` is `{ apply: false, before: null }`; `parseArgs(['--before=2026-05-20T10:00:00Z'])` gives `apply: false` and a `Date` equal to that instant; `parseArgs(['--apply', '--before=2026-05-20T10:00:00Z']).apply === true`.
        - `buildFilter without before` equals `{ timeShiftedAt: { $exists: false } }`; with `before` it adds `createdAt: { $lt: before }`.
        - `createRide stamps timeShiftedAt`: create a ride through `POST /api/rides` (use a new registered driver and `formatLocalDate(4)`), then `Ride.findById(id).lean()` has `timeShiftedAt` as a `Date`.
        - `filter protects new and post-fix rides`: insert two raw legacy-style docs with `Ride.collection.insertOne` (no `timeShiftedAt`): one with `createdAt` 2 hours ago, one with `createdAt` 10 minutes ago, plus the stamped API ride above. With `before = new Date(Date.now() - 60 * 60 * 1000)`, `Ride.collection.countDocuments(migrate.buildFilter(before))` matches only the 2-hours-ago doc (use a unique `pickupLocation` marker in the query: `{ ...filter, pickupLocation: 'MIGRATION-TEST' }`). Clean up the inserted docs in `afterAll`/`finally`.
      Files: `backend\models\Ride.js`, `backend\controllers\rideController.js`, `backend\scripts\migrate-shift-times.js`, `backend\tests\api.test.js`, `.agents\tasks\p0-verification.md`
      Verify: `cd backend; npm test` passes; `cd backend; node --check scripts/migrate-shift-times.js` exits 0; `cd backend; node scripts/migrate-shift-times.js --apply` exits with code 1 and prints the "--before" refusal (it must not connect or read `.env`). Do NOT run the script against the real database.

## Part B: P1 backend (vehicle type)

- [ ] 3. Model: add `vehicleType`, bike seat invariants and the compound index. (Depends on item 2 touching `Ride.js`.)
      In `backend\models\Ride.js`:
      - Add after `totalSeats`:
        ```js
        vehicleType: {
          type: String,
          enum: ['CAR', 'BIKE'],
          default: 'CAR', // missing on old documents means CAR (no migration)
        },
        ```
      - Add a `rideSchema.pre('validate', function (next) { ... })` hook (before `module.exports`): when `this.isNew || this.isModified('availableSeats') || this.isModified('totalSeats') || this.isModified('vehicleType')`: if `this.vehicleType === 'BIKE'` and (`this.totalSeats !== 1` or `this.availableSeats > 1`) call `this.invalidate('totalSeats', 'A bike ride has exactly 1 seat')`; if `this.availableSeats > this.totalSeats` call `this.invalidate('availableSeats', 'Available seats cannot exceed total seats')`. Call `next()`.
      - Add the index below the existing ones, leaving the TTL and `{ rideDate, status, departureDateTime }` index untouched:
        ```js
        // Compound Index: vehicle-filtered feed search
        rideSchema.index({ status: 1, vehicleType: 1, rideDate: 1, departureDateTime: 1 });
        ```
      Add tests in `backend\tests\api.test.js` under a new `describe('P1 vehicle type', ...)` (shared setup in item 5; at this step add only the model tests):
        - `rides collection indexes`: `await Ride.init(); const idx = await Ride.collection.indexes();` expect an index with key `{ status: 1, vehicleType: 1, rideDate: 1, departureDateTime: 1 }`, the original `{ rideDate: 1, status: 1, departureDateTime: 1 }` index, and the TTL index (`expireAfterSeconds === 0`, key `{ expiresAt: 1 }`) all present.
        - `model rejects a bike with 2 seats`: `await expect(Ride.create({...valid fields, vehicleType: 'BIKE', totalSeats: 2, availableSeats: 2})).rejects.toThrow()`; and `availableSeats > totalSeats` for a car rejects.
        - `model defaults vehicleType to CAR`: `Ride.create` without it gives `'CAR'`.
      Files: `backend\models\Ride.js`, `backend\tests\api.test.js`
      Verify: `cd backend; npm test` passes (TTL index test still passes).

- [ ] 4. Controller: `createRide`, `getRides`, `getRideById`, `getMyRides`, `updateSeats`. (Depends on item 3.)
      In `backend\controllers\rideController.js`:
      - Top-level helpers after `escapeRegex`:
        ```js
        const VEHICLE_TYPES = ['CAR', 'BIKE'];
        const isValidVehicleType = (v) => typeof v === 'string' && VEHICLE_TYPES.includes(v);
        const getVehicleType = (ride) => ride.vehicleType ?? 'CAR'; // old docs / .lean() lack the field
        ```
      - `createRide`: destructure `vehicleType` and `totalSeats` from `req.body`. Immediately after destructuring: if `vehicleType !== undefined && !isValidVehicleType(vehicleType)` return 400 `Vehicle type must be CAR or BIKE`; `const type = vehicleType ?? 'CAR'`. Change the required-field check so `availableSeats === undefined` only counts as missing when `type === 'CAR'`. Replace the seat block (step 2): for `CAR` keep the existing 1..6 validation and message; for `BIKE`: if `availableSeats !== undefined` and `Number(availableSeats) !== 1`, or `totalSeats !== undefined` and `Number(totalSeats) !== 1`, return 400 `A bike ride can carry only 1 passenger`; `seats = 1`. Add `vehicleType: type` to `Ride.create` (alongside `totalSeats: seats`, `availableSeats: seats`). Add `vehicleType: ride.vehicleType` to the 201 response `data`.
      - `getRides`: after the `date` check, read `let { vehicleType } = req.query`. If `vehicleType !== undefined && vehicleType !== ''`: if `!isValidVehicleType(vehicleType)` return 400 `Vehicle type must be CAR or BIKE`. Build the query: `CAR` => `query.vehicleType = { $ne: 'BIKE' }`; `BIKE` => `query.vehicleType = 'BIKE'`. Never query `{ vehicleType: 'CAR' }` (would miss old docs). Add `vehicleType: getVehicleType(ride)` to `formattedRides`.
      - `getRideById` and `getMyRides` mappers: add `vehicleType: getVehicleType(ride)`.
      - `updateSeats`: after loading the ride compute `const maxSeats = ride.vehicleType === 'BIKE' ? 1 : ride.totalSeats;` and change the cap check to `if (seats > maxSeats)` returning 400 with `A bike ride has only 1 seat` for bikes and the existing `Available seats cannot exceed total seats (N)` for cars (keep the earlier 0..6 integer validation and 404/403 order unchanged). Add `vehicleType: getVehicleType(ride)` to the response `data`.
      - Do not touch WhatsApp fields/links in `getRideById`.
      Files: `backend\controllers\rideController.js`
      Verify: `cd backend; npm test` — existing tests still pass (the existing create payloads omit `vehicleType`, so they must keep returning 201 as CAR).

- [ ] 5. Backend tests for P1 behavior in `backend\tests\api.test.js` (new `describe('P1 vehicle type', ...)` after `P0 hardening`). Setup: `beforeAll` registers `p1@carpool.test`, keeps `token` and `ownerId`; `const date = formatLocalDate(3)`; `baseRide = { pickupLocation: 'P1 Pickup', destination: 'P1 Dest', rideDate: date, departureTime: '09:00', availableSeats: 3, pricePerSeat: 100, whatsappNumber: '0310-5517386' }`; a `post(body)` helper using the Bearer token. Add these tests (exact names):
        1. `creates a ride without vehicleType as CAR`: 201, DB doc `vehicleType === 'CAR'`, `totalSeats === 3`.
        2. `creates an explicit CAR ride and a BIKE ride`: BIKE with `availableSeats: 1` => 201, DB doc has `vehicleType 'BIKE'`, `totalSeats 1`, `availableSeats 1`.
        3. `bike create without seats stores 1`: BIKE with `availableSeats` deleted => 201, seats 1/1.
        4. `rejects a bike with more than 1 seat`: BIKE with `availableSeats: 2` => 400; BIKE with `availableSeats: 1, totalSeats: 2` => 400; BIKE with `availableSeats: '3'` => 400; BIKE with `availableSeats: 0` => 400.
        5. `rejects invalid vehicleType values`: `'TRUCK'`, `'car'`, `''`, `null`, `123`, `['CAR']`, `{ $ne: 'x' }` each => 400 (response `success: false`).
        6. `car seats keep 1..6 and per-ride capacity`: CAR with `availableSeats: 7` and `0` => 400; create a 2-seat car and a 5-seat car; PATCH seats 3 on the 2-seat car => 400; PATCH seats 5 on the 5-seat car => 200.
        7. `bike seats can never exceed 1 via updateSeats`: PATCH `{ availableSeats: 0 }` => 200 `FULL`; `{ availableSeats: 1 }` => 200 `ACTIVE`; `{ availableSeats: 2 }` => 400; `{ availableSeats: 6 }` => 400. Also insert a raw legacy-corrupt bike via `Ride.collection.insertOne({... vehicleType: 'BIKE', totalSeats: 3, availableSeats: 0, ...})` (valid `driver: new mongoose.Types.ObjectId(ownerId)`, future `departureDateTime`/`expiresAt`) and PATCH `{ availableSeats: 2 }` => 400.
        8. `legacy rides without vehicleType are treated as CAR`: insert a raw doc via `Ride.collection.insertOne` (no `vehicleType`, no `timeShiftedAt`, future date `date`, unique pickup `'LEGACY-CAR'`, `driver: ownerId`) then: `GET /api/rides?date=<date>` includes it with `vehicleType === 'CAR'`; `?vehicleType=CAR` includes it; `?vehicleType=BIKE` excludes it; `GET /api/rides/:id` returns `vehicleType 'CAR'`; `GET /api/rides/my-rides` (that driver's token) returns it with `vehicleType 'CAR'`.
        9. `feed vehicleType filter works with date and keyword`: create a bike `'BIKE-ONLY-ROUTE'` and a car `'CAR-ONLY-ROUTE'` on `date`. `?date=<date>&vehicleType=BIKE` returns only bikes (every item `vehicleType === 'BIKE'`, includes the bike); `?date=<date>&vehicleType=CAR` returns no bikes and includes the car and the legacy doc; no param returns both; `?date=<date>&vehicleType=BIKE&keyword=BIKE-ONLY` returns exactly that bike; `?date=<date>&vehicleType=CAR&keyword=BIKE-ONLY` returns 0; `?vehicleType=` (empty) returns 200 with all types.
        10. `rejects invalid vehicleType query values`: `?vehicleType=TRUCK`, `?vehicleType=car`, `?vehicleType=CAR&vehicleType=BIKE`, `?vehicleType[$ne]=BIKE` each => 400.
        11. `every ride output includes vehicleType`: for the BIKE ride id, `GET /api/rides/:id` and `GET /api/rides/my-rides` return `vehicleType: 'BIKE'`, and every item in the `getRides` list has a `vehicleType` of `'CAR'` or `'BIKE'`.
        12. `WhatsApp behavior is unchanged`: guest `GET /api/rides/:id` for a bike still has `canContact false` and `whatsappNumber null`; feed items still have no `whatsappNumber` (guards against accidental P4 scope creep).
      Files: `backend\tests\api.test.js`
      Verify: `cd backend; npm test` — all suites green; note the final test count in the verification file.

## Part C: P1 frontend

- [ ] 6. Shared helpers: `frontend\src\utils\vehicle.js`, `frontend\src\components\VehicleBadge.jsx`, and a unit test.
      `utils\vehicle.js` (ES module like `utils\dateUtils.js`): export `VEHICLE_TYPES = ['CAR', 'BIKE']`, `normalizeVehicleType(value)` (returns `'BIKE'` only for exactly `'BIKE'`, else `'CAR'`), `getMaxSeats(ride)` (`BIKE` => 1; otherwise `Number(ride.totalSeats)` if a positive integer <= 6, else 6), `getVehicleLabel(type)` (`'Bike'` / `'Car'`).
      `components\VehicleBadge.jsx`: props `{ vehicleType, className = '' }`; renders a pill with an icon (`Car` or `Bike` from `lucide-react`, `aria-hidden="true"`) AND the visible text "Car" / "Bike" (never color alone). Colors: Car `bg-sky-50 text-sky-700 border-sky-200`, Bike `bg-violet-50 text-violet-700 border-violet-200`, base `inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border`. Uses `normalizeVehicleType`, so a missing value renders "Car".
      `tests\vehicle.test.js`: follow the style of `tests\networkError.test.js` (`node:test` + `node:assert`). Cover `normalizeVehicleType(undefined|null|'car'|'TRUCK') === 'CAR'`, `normalizeVehicleType('BIKE') === 'BIKE'`, `getMaxSeats({ vehicleType: 'BIKE', totalSeats: 4 }) === 1`, `getMaxSeats({ vehicleType: 'CAR', totalSeats: 2 }) === 2`, `getMaxSeats({}) === 6`, and labels.
      Files: `frontend\src\utils\vehicle.js`, `frontend\src\components\VehicleBadge.jsx`, `frontend\tests\vehicle.test.js`
      Verify: `cd frontend; npm test` passes; `npm run build` passes.

- [ ] 7. `frontend\src\pages\OfferRide.jsx`: Car/Bike selector and bike seat handling. (Depends on item 6.)
      - Add `vehicleType: 'CAR'` to the `formData` initial state. Import `Bike` from `lucide-react` (keep `Car`).
      - Add a new first block in the form (before "1. Route Details") or at the top of the Route section: a `<fieldset>` with `<legend>` "Vehicle Type" containing two native radio inputs (`type="radio" name="vehicleType" value="CAR" | "BIKE"`, class `sr-only peer`) each wrapped in a `<label>` styled as a large tap target (`min-h-[48px]`, two columns `grid grid-cols-2 gap-2`, selected state via `peer-checked:` classes consistent with the Gender Preference buttons: `bg-emerald-50 border-emerald-500 text-emerald-800`, plus `peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500`). Each shows an icon and text ("Car" / "Bike"). Native radios give arrow-key navigation and screen-reader semantics. Default is Car.
      - Add `handleVehicleChange(type)`: `setFormData((prev) => ({ ...prev, vehicleType: type, availableSeats: type === 'BIKE' ? 1 : (prev.vehicleType === 'BIKE' ? 3 : prev.availableSeats) }))`. Make `handleSeatChange` a no-op when `formData.vehicleType === 'BIKE'`.
      - Seats block: when `vehicleType === 'BIKE'`, replace the +/- stepper with a read-only display (`aria-disabled="true"`, same box size `h-[42px]`, text "1 seat") plus a hint `<p id="bike-seat-hint">` such as "A bike carries 1 passenger, so seats are fixed at 1." and `aria-describedby="bike-seat-hint"` on the display. When Car, render the existing stepper unchanged. Keep the section heading text.
      - Labels: keep "Vehicle Details (Optional)" label (already neutral) but change the heading "4. Optional Vehicle & Notes" only if needed; make the placeholder depend on type: Car keeps `e.g. White Honda Civic / Red Alto`, Bike uses `e.g. Red Honda CG-125 / Yamaha YBR`. Keep the `carDetails` field name.
      - `handleSubmit`: send `vehicleType: formData.vehicleType` and `availableSeats: formData.vehicleType === 'BIKE' ? 1 : Number(formData.availableSeats)` (the existing spread of `...formData` already includes `vehicleType`, but set the seats explicitly after the spread).
      Files: `frontend\src\pages\OfferRide.jsx`
      Verify: `cd frontend; npm run build; npm run lint` pass. Manual: run `npm run dev` and confirm Bike hides the stepper and the POST body has `vehicleType: 'BIKE'`, `availableSeats: 1`; switching back to Car restores the stepper at 3. If `npm run dev` cannot be run in this environment, state that in the verification file.

- [ ] 8. `frontend\src\components\RideCard.jsx` and `frontend\src\pages\RideDetails.jsx`: vehicle badge. (Depends on item 6.)
      - `RideCard.jsx`: import `VehicleBadge`; add `<VehicleBadge vehicleType={ride.vehicleType} />` in the "Ride Metadata" row next to the gender badge (before the seats badge is fine). Footer keeps `carDetails` with the `Car` icon replaced by the `Bike` icon when `normalizeVehicleType(ride.vehicleType) === 'BIKE'`. Seat text stays "N seat(s) left".
      - `RideDetails.jsx`: import `VehicleBadge` and `normalizeVehicleType`; place the badge next to the "Route Details" chip (wrap both in a `flex items-center gap-2` row). In the Grid Info "Vehicle" cell show the badge on top of the `carDetails` text (label stays "Vehicle"; when bike use the label "Vehicle details"-style text consistent with the form, i.e. "Vehicle details" for bike and "Vehicle" for car is acceptable; fall back to "Not specified"). Do not change the WhatsApp/contact section or disclaimer.
      Files: `frontend\src\components\RideCard.jsx`, `frontend\src\pages\RideDetails.jsx`
      Verify: `cd frontend; npm run build; npm run lint` pass.

- [ ] 9. `frontend\src\pages\Feed.jsx`: vehicle filter that composes with tabs and keyword. (Depends on item 6.)
      - Add state `const [vehicleFilter, setVehicleFilter] = useState('ALL'); // 'ALL' | 'CAR' | 'BIKE'`.
      - Change the effect to depend on both: `useEffect(() => { fetchRides(selectedDate, vehicleFilter); }, [selectedDate, vehicleFilter]);`. Change `fetchRides(date, vehicle)` to build the URL: ``const qs = `date=${date}` + (vehicle !== 'ALL' ? `&vehicleType=${vehicle}` : ''); api.get(`/rides?${qs}`)``. Update both retry calls (`OfflineNotice` `onRetry` and the error "Retry" button) to `fetchRides(selectedDate, vehicleFilter)`.
      - Guard against out-of-order responses when the user taps filters quickly: add `const requestId = useRef(0)` (import `useRef`); in `fetchRides` do `const id = ++requestId.current;` and skip `setRides/setError/setOffline/setLoading` when `id !== requestId.current`.
      - UI: under the day tabs, above the search box, add `<div role="group" aria-label="Filter by vehicle type" className="flex items-center gap-2 mb-4">` with three buttons "All", "Car", "Bike" (Car/Bike with their `lucide-react` icons, `aria-hidden`), `type="button"`, `aria-pressed={vehicleFilter === value}`, min height 40px, pill style matching the tab buttons (`bg-emerald-50 border-emerald-500 text-emerald-800` selected, `bg-white border-slate-200 text-slate-600` otherwise).
      - Keyword search and NLP parsing remain client-side on the fetched list and are unchanged; `handleClearSearch` does not reset the vehicle filter. Update the empty state text: when `vehicleFilter !== 'ALL'` and no search, show `No ${vehicleFilter === 'BIKE' ? 'bike' : 'car'} rides found for this date. Try another filter or day.` (keep the existing texts otherwise).
      Files: `frontend\src\pages\Feed.jsx`
      Verify: `cd frontend; npm run build; npm run lint` pass. Manual (if dev server is available): tapping Bike sends `GET /rides?date=...&vehicleType=BIKE`, tapping All omits the param, Today/Tomorrow/custom date keep the selected vehicle filter, and typing a keyword still filters within the vehicle-filtered list.

- [ ] 10. `frontend\src\pages\MyRides.jsx`: badge and bike seat cap. (Depends on item 6.)
      - Import `VehicleBadge` and `getMaxSeats`. Show `<VehicleBadge vehicleType={ride.vehicleType} />` in the route/status row (next to the status pill, same flex container, text visible).
      - In `handleUpdateSeats`, take the ride (or its max) instead of the hard-coded 6: change the guard to `if (newSeats < 0 || newSeats > maxSeats) return;` where `maxSeats = getMaxSeats(ride)`; pass the ride object from the button handlers (`handleUpdateSeats(ride, delta)`; compute `rideId = ride.id`, `currentSeats = ride.availableSeats` inside).
      - "+" button: `disabled={ride.availableSeats >= getMaxSeats(ride)}`; its `title` becomes `"A bike has only 1 seat"` for bikes and stays `"Increase seats"` for cars. Leave the "-" button and its tooltip unchanged.
      Files: `frontend\src\pages\MyRides.jsx`
      Verify: `cd frontend; npm run build; npm run lint; npm test` pass.

## Part D: Final verification and evidence

- [ ] 11. Full run. From `backend\`: `npm test` (all green). From `frontend\`: `npm run build`, `npm run lint`, `npm test` (all green). Fix anything that fails before moving on. Confirm no files were added to `package.json` dependencies (`git diff -- backend/package.json frontend/package.json` shows no changes) and that nothing was committed (`git status` shows only working-tree changes).

- [ ] 12. Write `.agents\tasks\p1-verification.md` (evidence only, no secrets). Include: commands run with pass/fail and test counts; the new migration usage (dry run, dry run with `--before`, `--apply --before=<UTC>`; explain `--before` = UTC instant the P0 time zone fix was deployed; the real-database dry run has NOT been executed and must be done by the owner before `--apply`); the F-3 behavior note (x-forwarded-for trusted only when `VERCEL` is set; self-hosted/proxied deployments see the proxy address, so the limiter is coarser there); the P1 behavior summary (missing vehicleType = CAR, no data migration; bike always 1 seat; filter semantics `$ne: 'BIKE'`); list of files changed; and anything not verified (e.g. manual browser checks if the dev server was not run). Do not commit.

## Files expected to change

Backend: `middleware\rateLimiter.js`, `models\Ride.js`, `controllers\rideController.js`, `scripts\migrate-shift-times.js`, `tests\api.test.js`.
Frontend: `src\utils\vehicle.js` (new), `src\components\VehicleBadge.jsx` (new), `src\pages\OfferRide.jsx`, `src\components\RideCard.jsx`, `src\pages\RideDetails.jsx`, `src\pages\Feed.jsx`, `src\pages\MyRides.jsx`, `tests\vehicle.test.js` (new).
Docs: `.agents\tasks\p0-verification.md` (migration note), `.agents\tasks\p1-verification.md` (new).

## Out of scope (do not do)

WhatsApp masking or removal (P4), multi-day/`seriesId` (P2), requests/chat (P3/P4), nav changes (P6), any data migration for `vehicleType`, any change to `carDetails` field name or `CommuteImpact*` components (they already work with `totalSeats = 1`), any new package, any git commit.
