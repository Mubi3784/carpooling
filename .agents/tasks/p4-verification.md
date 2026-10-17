
## A. Seat-race fix

Ran: `npm.cmd test` in backend (jest --runInBand, mongodb-memory-server only).
Result: Test Suites: 3 passed, 3 total; Tests: 101 passed, 101 total (92 existing + 9 new in tests/seat-race.test.js). Exit clean.
New tests: accept sets seatsReserved; concurrent accept vs cancel (10 iterations); double cancel credits once; failed reserve never ACCEPTED; last-seat race (one 200, one 409, FULL, 0 seats); claim returning null restores seats; claim throwing restores seats; linked-request failure compensation; reconcileSeats idempotent.
Changes: models/RideMatch.js (seatsReserved + index), utils/matchService.js (claimMatch, releaseSeatsForMatch, reconcileSeats, cancel uses release), controllers/matchController.js (reserve -> claim -> request MATCHED last, with rollback).
Not done: A6 backfill script (not requested in this step); reconcileSeats is exported but not yet wired to cron (B1.7).


## B1 (backend chat core, privacy masking, reports, cron)
Ran: `npm.cmd test` in backend (jest --runInBand, mongodb-memory-server only).
Result: 4 suites passed, 123 tests passed (previous 92 plus new chat.test.js; only the WhatsApp/email assertions in api.test.js were intentionally flipped to assert absence).
New: models Conversation/Message/ReportedFlag(reported_flags); utils chatHooks/chatAccess; /api/chat; /api/admin (reports, conversations, conversation messages; API only, no admin frontend in V1); /api/cron/cleanup (Bearer CRON_SECRET, timing-safe, 401 if unset/mismatch); GET/PATCH /api/auth/profile; vercel.json crons.
Not verified: real Vercel cron execution, production Mongo TTL timing.

## B2 (backend Web Push)
- Installed: npm.cmd install web-push --save-exact -> web-push 3.6.7 pinned in backend/package.json.
- Implemented models/PushSubscription.js, utils/push.js, controllers/pushController.js, routes/pushRoutes.js (/api/push), triggers in chat send, createMatch, accept, decline; tests/push.test.js.
- npm.cmd test: NOT confirmed. The terminal stopped returning output; an earlier run failed only on short test user names in push.test.js, since fixed. Needs re-run. Retries after the orchestrator's tips (Set-Location, output to file) produced no log file, so no pass count is available. The orchestrator saw tests/push.test.js print PASS in a full run before output stopped. Reviewer: please flag the unconfirmed full-suite result.
- Review follow-ups (approved by orchestrator): throttle is now per recipient (Conversation.lastPushAt.driver / .passenger), and the window is claimed only after confirming the recipient has at least one subscription. Added 2 tests (reply within 30s still notifies the other person; window not spent without a subscription).
- Ran: `npx.cmd jest tests/push.test.js --runInBand` in backend. Result: 1 suite passed, 14/14 tests passed. Full backend suite not re-run in this step; the final frontend gate records it.
- Full-suite status for B2: UNCONFIRMED (accepted by user; push.test.js 14/14 passing is the evidence).
