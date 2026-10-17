# P5 verification (iteration 1)

Every command was run once, output redirected to a log in `.agents\tasks\`, and read back. Real results:

| Command (cwd) | Log | Result |
|---|---|---|
| `npm.cmd test -- matching` (backend) | `p5-be-matching.log` | 2 suites, 51 tests passed, EXIT 0 |
| `npm.cmd test` (backend, full) | `p5-be-full.log` | 7 suites, 188 tests passed (incl. `matching.test.js`, `matching-endpoints.test.js`), EXIT 0 |
| `npm.cmd run build` (frontend) | `p5-fe-build.log` | vite build OK, 2008 modules, PWA generated, EXIT 0 (only the existing >500 kB chunk warning) |
| `npm.cmd run lint` (frontend, oxlint) | `p5-fe-lint.log` | 0 errors, EXIT 0. Warnings only; new ones are the repo's usual `set-state-in-effect` pattern in the two new pages |
| `npm.cmd test` (frontend, `node --test`) | `p5-fe-test.log` | 83 tests, 83 pass, 0 fail, EXIT 0 (includes the 5 new `matches.test.js` tests) |

Not verified: the UI was not exercised in a browser (no manual or e2e run); frontend behaviour is covered by build, lint and the pure-helper tests only.

## What the new tests cover
- `backend\tests\matching.test.js` (pure): thresholds, normalisation, filler words, `textMatches`, EXACT/CLOSE/ALTERNATIVE boundaries (30/31, 90/91, 120/121), bike-vs-car both directions, capacity by `availableSeats`, legacy ride without `vehicleType` as CAR, different date/FULL/CANCELLED/expired (injected `now`)/zero seats/self exclusion, ranking order, deep-frozen inputs not mutated.
- `backend\tests\matching-endpoints.test.js`: owner vs non-owner (404) vs guest (401) vs malformed id, no contact data or other-user ids in bodies, `existingMatch` PENDING/ACCEPTED, no mutation (snapshots equal), bike ride sees only count 1, legacy ride inserted without `vehicleType`, counts endpoint uses exactly one `Ride.find`, ride and request filter validation (array/object/over-length/out-of-range gives 400), regex metacharacters matched literally, date param still works.

## Behaviour decisions to review
- ALTERNATIVE is always within 120 min, including a different-vehicle ALTERNATIVE (spec text "different vehicle OR time up to 2 hours" could be read as no time limit for a different vehicle; a time cap avoids irrelevant results).
- Different-vehicle ALTERNATIVE: Request to Join omits `requestId` (server rejects vehicle mismatch with a linked request); driver side shows a note instead of "Offer my ride".
- Feed filter panel shows in Passenger mode only; in Driver mode the filters are ignored (not silently applied) and the Requests page holds the driver filters.
- `keyword` on `GET /api/rides` still ignores non-strings (unchanged); only the new params 400 on arrays/objects.
- No new npm packages; `package.json` files unchanged. Nothing committed.
