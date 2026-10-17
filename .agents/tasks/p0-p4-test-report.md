# P0 to P4 test report (Stage 1)

Result: **no blocking bugs found.** Gate file `stage1-gate.json` is `blockingResolved: true` (found 0, fixed 0, remaining 0). No project source file was changed by this stage. Nothing was committed. All live testing used a throwaway in-memory MongoDB; no `.env` file was read, and nothing touched production data.

## 1a. Suites (real counts)

| Suite | Result |
|---|---|
| Backend `npm test` (jest, 5 suites: api, chat, push, requests-matches, seat-race) | 5/5 suites passed, **137/137 tests passed** |
| Frontend `npm run lint` (oxlint) | exit 0, **0 errors, 20 warnings** (react-hooks style rules, unused import `Car` in Home.jsx; no new class of warning) |
| Frontend `npm run build` | passed, PWA generateSW, 20 precache entries. Chunk-size warning (>500 kB) is pre-existing |
| Frontend `npm test` (node:test, run after the build) | **78/78 passed**, 0 failed, 0 skipped. Includes built `sw.js` checks (push handler imported, `/api/` still NetworkOnly) |

All existing backend test files connect to `mongodb-memory-server` and refuse non-local URIs (checked in the test headers).

## 1b. Live API end-to-end (real Express app, in-memory Mongo, real HTTP)

Harness lived in `%TEMP%\carpool-e2e` (now deleted). Mongo ran with the TTL monitor disabled so cleanup counts were deterministic. Web-push was mocked at module level; dummy VAPID keys and a random CRON_SECRET existed only inside the script process. The cwd contained no `.env`, and the script aborted if `MONGO_URI` was not `mongodb://127.0.0.1...` (it never printed it).

| Pass | Result |
|---|---|
| NODE_ENV=development | **288/288 assertions passed** |
| NODE_ENV=production | **290/290 assertions passed** (adds prod 5xx check and the privacy-scanner canary) |

Coverage, mapped to the brief (all passed in both modes):

1. **Auth/profile**: register and login return only `{token, user:{id,name,role}}`; `/auth/me` same; login failure message identical for wrong password and unknown user; `/auth/profile` is self-only (query ids ignored, PATCH cannot change email/role/password, invalid phone/name/object rejected, phone sanitized to `92...`).
2. **Rides**: Car x3 dates, Bike (forced 1 seat, `availableSeats` 2 / `totalSeats` 2 rejected), car seats 0 and 7 rejected, `ANY` rejected, 7 dates rejected, duplicate dates rejected. 08:30 PKT is stored as `03:30Z` (expiry `03:45Z`). Window: yesterday and today+14 rejected, today+13 accepted, today-with-future-time accepted, today-with-past-time rejected. Cap of 7 counts rides and requests together (6 rides + 1 request = 7, then both a request and a ride get 409). Idempotency: same `clientRequestId` replays (200, same ids, no new rows), including two concurrent identical submits (exactly 2 rows). `?date[$ne]=x` returns 400, regex keyword is safe.
3. **Requests**: Bike/Car only (`ANY`/`Any` rejected, bike with 2 passengers rejected), edit works, cannot edit `status`, other users get 404, cancel one date leaves the rest, cancel series removes the rest.
4. **Flows**: Flow A (driver offers, passenger accepts: seats 3 to 1 for a 2-passenger request, request becomes MATCHED, conversation created) and Flow B (join, driver accepts). Declined offers/joins cannot be resent (409, both directions). Only the non-initiator can accept or decline (403), non-participants get 404, the initiator can cancel a PENDING one, the responder cannot. Viewing, "seen" and chat reads never mark MATCHED. Cancel after accept restores seats, deletes chat and messages, reopens the request, and a second cancel does not double-credit. Concurrency (Promise.all): two accepts for the last seat give exactly one 200 and one 409 (ride FULL, seats 0, 1 accepted match, 1 chat); triple accept of the same match decrements once; mixed counts (1,1,2 on a 2-seat ride) never oversell; bike 1-seat race is safe; two offers from two drivers accepted at once for one request leave exactly one ACCEPTED, the other rolled back with seats restored.
5. **Chat**: a third user, another driver and unauthenticated callers get 404/401 on every chat route (conversation, messages list, send, report; list and unread-count give 401). Validation: empty, whitespace, >500, >2000, object/number body, missing or malformed `clientMessageId` all 400. Control characters stripped; HTML (`<script>`, `<img onerror>`) stored and returned verbatim as inert text with `application/json`. Idempotent `clientMessageId` (replay 200, one row). Cursor polling by id and by ISO date returns only newer messages; unread counters increment and reset. Rate limit: 429 after 20 messages/min with `Retry-After`. 300-message cap returns 429 with the limit message. Report snapshot created once (text, sender id, ride context, expiry about 15 days), re-report is idempotent, own-message report 400, invalid reason/object/long note 400. Admin endpoints: admin 200, participant and normal users 403, unauthenticated 401.
6. **Read-time expiry**: ride `expiresAt` forced into the past: next chat GET, send, or report returns 410 and the conversation and messages are gone from the DB. Same for conversation-only expiry and a vanished ride. Expired chats vanish from the list; expired ride detail returns 404; joining an expired ride returns 404.
7. **Privacy sweep**: 321 JSON responses across 43 distinct endpoint shapes were scanned recursively for keys matching email/phone/whatsapp and for every fake email and phone (raw, `92...` and last-9 forms). **Zero hits**; only the tagged own `/auth/profile` responses carry contact data. A built-in canary proved the scanner flags planted leaks. Ride detail, feed and my-rides no longer return WhatsApp (the driver's number is stored sanitized in the DB and never returned).
8. **Push**: public-key returns `null` with VAPID unset and only the public key when set; subscribe/unsubscribe validated (https only, key checks, object injection rejected), a different user cannot delete someone's subscription, cap of 5 per user. With VAPID unset nothing is sent. With VAPID set, payloads are exactly "New message received" / "New ride request" (no text, names or places); message pushes are throttled; an endpoint answering 410 is deleted.
9. **Cron**: 401 without header, wrong secret, wrong scheme, and with `CRON_SECRET` unset (including `Bearer undefined` and an empty bearer); POST is 404. Seeded stale data gave exactly: seatsReleased 1, conversations 2, messages 5, rides 2, matches 3, requests 2, reports 2, pushSubscriptions 1. Fresh data (ride, chat, messages, accepted match, grace-period request, fresh report and subscription) untouched; a crash-leftover seat was credited back; second run returned all zeros. TTL and unique partial indexes are declared and built.
10. **Authorization**: other drivers/passengers get 403/404 on ride delete, seats, series delete; unauthenticated gets 401 everywhere checked; rides stayed untouched afterwards.
11. **Errors**: production 5xx body is exactly `Internal Server Error` (no stack, raw Mongo error, URI or path); controller-level 5xx return generic text in any mode; malformed JSON gives 400 without stack.
12. **Rate limits**: login 429 after 10 attempts (with `Retry-After`; a correct password is also blocked during the window); register 429.

Extra adversarial probes (dev mode) are in the findings below.

## 1c. Browser UI test (Microsoft Edge headless via playwright-core, real Vite dev server + in-memory backend)

Done within the time box. Vite ran with `VITE_API_URL` in the process environment only (`.env` untouched). Mobile 390x844 (touch) and desktop 1280x800. Two separate browser contexts (Pia, Dana) chatted with each other.

Passed:
- Guest and logged-in bottom nav: exactly 4 items, Home, Active Rides, Chat, Profile; no Roads. Bottom nav hidden on desktop.
- Mode switcher: default Passenger, FAB label "Post Request"; Driver gives "Offer Ride"; mode persisted in `localStorage` and after reload. FAB sits above the bottom nav (FAB bottom 772 vs nav top 787) with no overlap on `/`, `/active`, `/chat`, `/profile`, `/matches`, `/request-ride`, `/offer-ride`, `/my-requests`, `/requests`.
- **No horizontal overflow** on any of those routes at 390 px, nor on desktop `/`, `/active`, `/chat`, `/profile`, `/matches`.
- Profile: details, private phone/email note, Road Status link, logout. Offer Ride: Bike shows "A bike carries 1 passenger, so seats are fixed at 1." with no seat stepper, Car shows the stepper; 14 date chips (today..+13); days stepper stops at 6. Post Request: Car/Bike only (no "Any"), 14 chips, max 6 days, submit created the requests. A bike offer for 2 dates was created with 1 seat.
- Offers & Requests inbox: Accept reserved the seat and "Open chat" appeared (passenger side Flow A; driver-mode Flow B accept set the bike ride to FULL).
- Chat between two contexts: send, receive via polling, reply containing `<b>sharp</b>` rendered as literal text (no bold element), composer not covered by the bottom nav, Report dialog (focus moves into it, Escape closes it, a report is created in the DB).
- Chat-ended: after the ride time passed, the thread showed "This chat has ended because the ride time has passed", the composer is disabled, and conversation and messages were deleted in the DB. The other participant's open thread also switched to the ended state on its next poll.
- Console: the only console errors were the expected 410 and 404 responses from the ended chat. No failed network requests, no page errors, no unexpected 4xx/5xx API responses.

The harness reported 34/38. The 4 non-passes were not product bugs: (a) the Profile "notifications" button is not rendered because the dev server has no service worker, so push is reported unsupported and only the explanatory text shows (real-device check needed); (b) my seat-field selector for Offer Ride was wrong, re-checked with a fixed script (see above); (c) the bike-offer step clicked a disabled chip, re-checked and the ride was created correctly; (d) the chat-ended assertion expected 0 conversations but a second seeded conversation correctly survived (only the expired one was purged). The first attempt also failed login because `frontend/src/services/api.js` ignores a `VITE_API_URL` that contains `localhost` in dev (it falls back to `:5000`); using `127.0.0.1` fixed it (see N6).

Screenshots for the key states are in `.agents/tasks/e2e-shots/` (profile, inbox, chat received, report dialog, chat ended, bike offer, driver-mode, plus the harness `FAIL-*` captures).

## 1d. Findings

### BLOCKING
None. No privacy leak, authz bypass, atomic-seat oversell, data loss, crash or broken core flow was found.

### NON-BLOCKING (none fixed; no trivial fix applied)

| # | Severity | Finding | Suggested fix |
|---|---|---|---|
| N1 | **Medium** (needs a product decision) | The manual seat stepper (`PATCH /rides/:id/seats`, MyRides +/-) can raise `availableSeats` up to `totalSeats` even while accepted passengers hold seats. Reproduced: 2-seat car, 2 seats accepted (available 0), driver sets 2, a third passenger is accepted, so 4 passengers booked on a 2-seat car. The atomic accept path is safe; this is the driver's own override. | Cap manual seats at `totalSeats - sum(passengerCount of ACCEPTED matches)` (400 otherwise) and disable "+" in MyRides at that value, or retire the manual stepper now that accepts decrement seats automatically. I did not change it because it changes what drivers see. Recommend deciding before launch. |
| N2 | Low | Non-string JSON values return 500 (generic message) instead of 400: login `email`/`password` objects, register `name` object, ride `pickupLocation`/`notes`/`carDetails` non-strings. Not injectable (the `.trim()` throws before any query). | Add `typeof === 'string'` guards in auth and ride create. |
| N3 | Low | Ride create with an invalid optional value (for example `genderPreference: 'x'`, over-long `carDetails`) returns 500: `insertMany(..., {ordered:false})` silently drops invalid docs and `seriesPayload([])` throws. Nothing is written. | Validate enum and lengths up front, or detect an empty `inserted`. |
| N4 | Low | A request from a disallowed CORS origin returns 500 (message hidden in prod) instead of 403. No `Access-Control-Allow-Origin` is sent, so it is blocked. | Set `err.status = 403` in the CORS origin callback. |
| N5 | Low | Editing a request (passenger count or time) while a driver offer is PENDING does not invalidate the offer. Accepting still uses the count snapshotted at offer time (verified 1 to 3 passengers edit, accept used 1). | Cancel or flag pending offers when the request is edited, or lock edits while offers are pending. |
| N6 | Info (dev only) | `frontend/src/services/api.js` ignores `VITE_API_URL` when it contains `localhost` and falls back to `http://<host>:5000/api`. | Fine for production; mention in dev docs or relax the check. |
| N7 | Info | Driver `id` (an ObjectId, not contact info) is returned in the rides feed and detail. No endpoint looks users up by id. | Optional: drop it if the UI does not need it. |
| N8 | Info | `resolveRole` grants admin to the `ADMIN_EMAIL` address with no email verification. Safe only if that account already exists in production. | Confirm the admin account is registered; pre-existing, not from P0-P4. |
| N9 | Info | 20 lint warnings (react-hooks purity/set-state-in-effect) and a >500 kB chunk warning. | Clean up in P6. |
| N10 | Info | Rate limiters are per-IP, in-memory, per serverless instance (documented), so on Vercel they are best effort. | Accepted per decision 15. |

## Not verified (cannot be done in this environment)
- Real Web Push delivery (Android/iPhone), permission prompt, notification click, and the Profile notifications button on a real service worker (web-push was mocked; dev server has no SW).
- Mongo's own TTL deletion timing (monitor disabled in the harness; index definitions and read-time/cron deletion were verified).
- Behaviour on Atlas: index creation permissions, ops throttling, and the daily cron registration on Vercel.
- Service worker update flow and `importScripts` loading in an installed PWA; production build served by Vercel (UI test used the Vite dev server).
- Screen-reader and full keyboard accessibility (only Escape/focus-in-dialog were checked); iOS Safari rendering.
- The Vercel `x-forwarded-for` rate-limit key.

## Manual checks for the user (about 10 minutes, after deploy)
1. Set the Vercel env keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`), deploy backend and frontend together, and confirm the cron `0 0 * * *` appears in the Vercel dashboard.
2. In Atlas, confirm the indexes exist (TTL on rides/requests/matches/conversations/messages/reported_flags/push subscriptions; the unique partial ones).
3. On an Android phone with the installed PWA: Profile, enable notifications, send a chat message from a second account, and check that a generic "New message received" arrives and tapping it opens `/chat`. On iPhone, add to Home Screen first.
4. Hit `/api/cron/cleanup` with and without `Authorization: Bearer <CRON_SECRET>` (expect 401 / 200).
5. Spot-check with a screen reader or keyboard: mode switcher arrow keys, report dialog Tab trap.

## Cleanup done
Stopped the throwaway backend and Vite dev server (ports 5055/5056/5173 free), deleted `%TEMP%\carpool-e2e` and temp logs, and kept the screenshots under `.agents/tasks/e2e-shots/`. No packages were added to the project (playwright-core lived only in the temp folder). No git commit was made.
