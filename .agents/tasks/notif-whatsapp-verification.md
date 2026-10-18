# Verification: Notification banner + WhatsApp sharing (iteration 1)

All changes are uncommitted. No git writes, no packages installed.

## Commands run and results
- `cd backend; npx jest --runInBand`: 8 suites passed, 196 tests passed (includes new `tests/hardening.test.js`: GET/PATCH/DELETE `/api/rides/not-an-id` and GET `/api/requests/not-an-id` return 404; `Ride.whatsappNumber` is stored but absent from plain queries and from GET `/api/rides/:id`, `/api/rides`, `/api/rides/my-rides` responses).
- `cd frontend; npm run lint` (oxlint): exit 0, warnings only, all pre-existing files/rules (none in new files).
- `cd frontend; npm test` (node --test): 132 tests, 132 pass, 0 fail (new: share.test.js, shareWiring.test.js, notificationBanner.test.js, safeRedirect/storage cases in nav.test.js, Feed banner case in homeWiring.test.js).
- `cd frontend; npm run build`: success, PWA precache 20 entries, only the pre-existing chunk-size warning.

## Not done
- Live server check (`GET /api/rides/xyz`): not run against a real server because backend/.env points at a remote database; equivalent coverage is the in-memory supertest tests above.
- Visual check at 390px / desktop: no browser available in this environment; not performed. Manual steps are in plan section 9.

## Backend audit (whatsappNumber)
Only writer is `createRide` (create path, uses request body, not a query). No code path reads `ride.whatsappNumber`, so no `+whatsappNumber` select was needed. Existing `.select('-whatsappNumber')` calls left in place (harmless).
