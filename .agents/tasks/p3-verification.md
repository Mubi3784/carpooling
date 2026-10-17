# P3 Verification

## Commands run and results
- Backend `npm.cmd test` (in `backend\`, Jest --runInBand, mongodb-memory-server-core only): 2 suites passed, 92 tests passed, 0 failed (`api.test.js` P0-P2 unchanged and green; new `requests-matches.test.js`).
- Frontend `npm.cmd run build`: success (vite, 1988 modules).
- Frontend `npm.cmd run lint` (oxlint): 0 errors; warnings only. New warnings: `react(set-state-in-effect)` in Requests.jsx, MyRequests.jsx, Matches.jsx for the same fetch-in-effect pattern the existing pages (MyRides, Feed) already use. Other warnings pre-existing.
- Frontend `npm.cmd test` (node --test): 48 tests passed, 0 failed (includes new `tests/requests.test.js`).

## Covered by backend tests
Request validation (7 dates, duplicates, past, window, Any/missing vehicle, bike forced 1, car 1..6, text limits), idempotent resubmit and parallel duplicate, combined cap (5 rides + 2 requests ok, 8th rejected, rides blocked by requests, expired/cancelled not counted), owner-only edit/cancel (404 for others), malformed ids 404, query-injection 400, filters, first-name-only passenger, no contact data/ids in responses, expired hidden from browse and not offerable, expired visible to owner as EXPIRED until purgeAt, indexes (TTL + unique partial), Flow A and B, only the other party accepts/declines (403), outsiders 404, duplicate pending 409, no resend after decline, resend after cancel, vehicle mismatch, seats/date/expired checks, concurrent accept on last seat (one 200, one 409, seats 0, FULL, loser stays PENDING), double accept of same match decrements once, cancel after accept restores seats/ACTIVE/reopens request/calls `purgeChatForMatch`, ride delete and series delete cascade, request series delete restores seats, expired match actions rejected, alert count behaviour, viewing never sets MATCHED.

## Decisions on ambiguous points
- Combined cap: rides (ACTIVE/FULL) + requests (ACTIVE/MATCHED), both not expired, share one budget of 7 via `countActiveFutureItems`. Done cleanly with a helper; best effort under concurrency.
- Failed accept (no seats): match stays PENDING, 409 friendly message (acceptor can decline). Ride missing/expired/cancelled: match is CANCELLED, 409. If the linked request is no longer ACTIVE: 409, match left PENDING (seats rolled back if already taken).
- Cancel after a decline is allowed to resend; declined cannot be resent.
- Responses for a DELETE of a request/ride are not blocked by matches; they cascade.
- Rate limits: requests create 20/10min, match create 40/10min, accept/decline/cancel 80/10min per IP; raised to 10000 only when `NODE_ENV=test`.

## NOT verified
- No browser verification at all: the new pages (RequestRide, MyRequests, Requests, Matches), RideDetails "Request to Join", Navbar links/badge (including the mobile row), polling/visibility behaviour of the alert badge, and layout at mobile width were only built and linted, never rendered or clicked.
- No API smoke test against a real server or Atlas data; only in-memory tests via supertest.
- Index creation on the real Atlas DB (rights) not checked.
- Concurrency of the cap check is best effort (not tested under parallel creation).
