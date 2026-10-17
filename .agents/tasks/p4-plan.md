# P4 Implementation Plan (A: seat race, B1: chat+privacy+reports+cron, B2: push, C+B3: frontend)

Project root: `d:\Mubashir\carpooling\carpooling`. Windows PowerShell: use `;` not `&&`, call `npm.cmd`. No git commits. Never read/print `.env` values; no real VAPID keys in files; nothing runs against production.
Backend tests: `cd backend; npm.cmd test` (jest --runInBand, mongodb-memory-server-core, supertest; existing `tests\api.test.js`, `tests\requests-matches.test.js`). Frontend: `cd frontend; npm.cmd run lint; npm.cmd test; npm.cmd run build` (`node --test tests/*.test.js`, oxlint, vite).
Only new package: `web-push` in backend (`npm.cmd install web-push --save-exact`). No express-rate-limit / helmet.

## Findings from exploration (grounding)
- The seat logic lives in `backend\utils\matchService.js` (NOT services\): `reserveSeats` (atomic pipeline update, ACTIVE+seats>=n+not expired, sets FULL), `restoreSeats` (min with totalSeats, FULL->ACTIVE), `cancelMatchInternal(match, by, {restore})`, `cascadeCancelForRide/Request`. Controller `backend\controllers\matchController.js` `acceptMatch` currently claims PENDING->ACCEPTED FIRST, then reserves, then reverts on failure (the false-ACCEPTED window), then marks request MATCHED, then `chatHooks.createChatForMatch`.
- `backend\models\RideMatch.js` has no `seatsReserved` field. `cancelMatchInternal` credits seats whenever previous status was ACCEPTED.
- `backend\utils\chatHooks.js` has stub `createChatForMatch/purgeChatForMatch`; callers use `chatHooks.fn(...)` (spy-able). Keep that call style.
- `backend\middleware\rateLimiter.js` exports `createRateLimiter({windowMs,max,message})` (in-memory, per-IP) and `getClientIp`. Chat needs Mongo-backed per-user counters (new).
- `backend\server.js` mounts routes `/api/auth|rides|requests|matches|road-status`; error handler exists. `backend\vercel.json` has no `crons`.
- Privacy leaks to fix: `authController.js` register/login/getMe return email+phone; `rideController.getRideById` returns `whatsappNumber` + `whatsappLink` to any logged-in user; `frontend\src\pages\RideDetails.jsx` renders the WhatsApp button and "coordinate via WhatsApp" copy; `frontend\src\pages\OfferRide.jsx` prefills `user?.phone` and requires `whatsappNumber`; `Register.jsx` collects phone (keep); `Home.jsx` copy mentions WhatsApp; `MyRides.jsx` tooltip mentions WhatsApp; `roadStatusController.js` uses `author.email` only server-side for admin check (verify it does not return email). `matchController` views (`buildMatchView/populateForView`) must be audited for populated driver/passenger fields (only id+name allowed).
- Frontend: `App.jsx` routes (Feed `/`, `/rides/:id`, `/road-status`, `/offer-ride`, `/my-rides`, `/request-ride`, `/my-requests`, `/requests`, `/matches`), `components\BottomNav.jsx` (Browse/Roads/Offer/My Rides|Login), `context\AuthContext.jsx` (stores full user), `context\AlertContext.jsx` (polls `getAlertCount` every 45 s; pattern for chat unread badge), `services\api.js` (axios exports), tests are `node --test` pure-JS in `frontend\tests`.

## DECISIONS
- Seat-state field `RideMatch.seatsReserved` (Boolean, default false) is the single source of truth for "seats are held by this match". Credits only happen via an atomic `findOneAndUpdate({_id, seatsReserved:true},{$set:{seatsReserved:false}})`.
- Chat is keyed 1:1 to a match: `Conversation.match` unique, plus `ride`, `driver`, `passenger`. Matches are already one-per-(ride,passenger), so this satisfies "bound to ride_id".
- Message rate limit and report limit use a Mongo `RateCounter` collection (TTL) so they work across serverless instances. Auth keeps the existing in-memory limiter.
- Push subscriptions in their own `PushSubscription` collection (not on User) so User responses cannot leak them.
- No restructuring of the workflow tail: the four existing loops (p4a, p4b1, p4b2, p4c) map 1:1 onto the sub-phases below.

---
## SUB-PHASE A: Seat-race fix (verdict file: `.agents\tasks\p4a-review.json`)

Order matters: 1 -> 2 -> 3 -> 4 -> 5.

- [ ] A1. Model: add `seatsReserved: { type: Boolean, default: false }` to `backend\models\RideMatch.js`. Add index `{ status: 1, seatsReserved: 1, expiresAt: 1 }` (used by reconcile).
  Verify: `cd backend; npm.cmd test` all existing tests still pass.

- [ ] A2. `backend\utils\matchService.js`: keep `reserveSeats`/`restoreSeats` atomic (restore already caps at totalSeats and flips FULL->ACTIVE; also ensure restore never goes below 0 and is a no-op on CANCELLED/expired rides). Add:
  - `claimMatch(matchId, role, prevSeen)`: `findOneAndUpdate({_id, status:'PENDING'}, {$set:{status:'ACCEPTED', seatsReserved:true, respondedAt:new Date(), seenByDriver:role==='DRIVER', seenByPassenger:role==='PASSENGER'}}, {new:true})`.
  - `releaseSeatsForMatch(matchId)`: `findOneAndUpdate({_id, seatsReserved:true}, {$set:{seatsReserved:false}}, {new:false})`; only if it returns a doc call `restoreSeats(doc.ride, doc.passengerCount)`. Returns boolean credited. This is the ONLY seat-credit path.
  - Change `cancelMatchInternal`: after flipping status to CANCELLED, if `restore` is true call `releaseSeatsForMatch` (replace the `previous.status==='ACCEPTED'` credit). With `restore:false` (ride deleted) still flip `seatsReserved` to false without crediting. Cancelling a PENDING match never credits (seatsReserved false).
  - `reconcileSeats({ rideId } = {})`: idempotent crash recovery. (1) ACCEPTED matches with `seatsReserved:false` (crash between reserve and claim cannot create these by design, but if found: do nothing/log). (2) CANCELLED/DECLINED matches with `seatsReserved:true` (crash after status flip before release): call `releaseSeatsForMatch`. (3) Optionally per ride recompute check: `availableSeats` must equal `totalSeats - sum(passengerCount of ACCEPTED seatsReserved matches)`; log mismatch only, no auto-write. Document at top of file. Call it from the daily cleanup job (B1) and export it.
  Verify: unit tests in A5.

- [ ] A3. `backend\controllers\matchController.js` `acceptMatch`: new order, with these exact semantics:
  1. Pre-checks (participant, responder role, PENDING, not expired, ride exists/active, linked request ACTIVE) unchanged.
  2. `reserveSeats(match.ride, match.passengerCount)`; on null -> 409 "not enough seats" and the match stays PENDING (never ACCEPTED).
  3. `claimMatch(...)`; if null (someone else answered / concurrently cancelled) -> `restoreSeats(match.ride, match.passengerCount)` (atomic, capped, FULL->ACTIVE) and return 409 "already answered". If `claimMatch` throws, also restore then rethrow.
  4. LAST step: if `match.request`, `RideRequest.updateOne({_id, status:'ACTIVE', expiresAt>now}, {$set:{status:'MATCHED', matchedRide}})`. If `matchedCount===0` compensate: `cancelMatchInternal`-style rollback = flip match ACCEPTED->PENDING only if still ACCEPTED (`findOneAndUpdate({_id,status:'ACCEPTED',seatsReserved:true}, {status:'PENDING', seatsReserved:false, respondedAt:null, seen flags restored})`) and, if that succeeded, `restoreSeats`; return 409. (Brief window where ACCEPTED is visible with seats reserved is acceptable: seats are real.) If the request update throws, run the same compensation then rethrow.
  5. Then `chatHooks.createChatForMatch(claimed)`; failure to create chat must not roll back the accept (log; B1 makes `createChatForMatch` idempotent and the chat endpoints lazily create via match if ACCEPTED and no conversation).
  Remove the old `revert` closure.
  Verify: tests in A5.

- [ ] A4. Audit other seat-credit callers: `rideController.js` (updateSeats, deleteRide/series -> `cascadeCancelForRide`), `requestController.js` (`cascadeCancelForRequest`). Ensure none credit outside `releaseSeatsForMatch`. Ride manual `updateSeats` must clamp 0..totalSeats and cannot go below seats held by reserved matches (reject with 409 if requested availableSeats would make `totalSeats - available < reserved sum`? keep simple: only reject values > totalSeats, already present; do not expand scope).
  Verify: `cd backend; npm.cmd test`.

- [ ] A5. Tests: extend `backend\tests\requests-matches.test.js` (follow its existing helpers/mongodb-memory-server setup) or add `backend\tests\seat-race.test.js`:
  - concurrent accept vs cancel (`Promise.all` of POST accept + POST cancel on same match): final state consistent, either (CANCELLED, seatsReserved false, seats == original) or (ACCEPTED, seatsReserved true, seats == original - count). Repeat in a loop of ~10 iterations.
  - double cancel (sequential and `Promise.all`) credits exactly once.
  - failed reserve never exposes ACCEPTED: ride with 0/insufficient seats, accept returns 409, match still PENDING, seatsReserved false (assert in DB).
  - last-seat race: ride with 1 seat, two PENDING matches (different passengers), `Promise.all` of both accepts: exactly one 200, one 409, ride FULL with availableSeats 0.
  - claim-failure restore: simulate by cancelling the match between reserve and claim (jest spy on `claimMatch`/`RideMatch.findOneAndUpdate` returning null once) -> seats restored, never above totalSeats.
  - invariant helper: after every scenario `0 <= availableSeats <= totalSeats` and `availableSeats === totalSeats - sum(reserved ACCEPTED passengerCount)`.
  - linked-request failure compensation: make the request non-ACTIVE after pre-check (spy) -> match back to PENDING, seats restored.
  - `reconcileSeats`: manually create CANCELLED match with seatsReserved true -> reconcile credits once; second run credits nothing.
  Verify: `cd backend; npm.cmd test` all pass.

Verdict: reviewer writes `.agents\tasks\p4a-review.json` `{"verdict":"APPROVED"|"CHANGES_REQUESTED", ...}`.

---
## SUB-PHASE B1: Backend chat core + privacy masking + reports + cron (verdict: `.agents\tasks\p4b1-review.json`)
Order: B1.1 -> B1.2 ... dependent order below. Run `cd backend; npm.cmd test` after each.

- [ ] B1.1 Models (new files in `backend\models\`):
  - `Conversation.js`: `match` (ObjectId RideMatch, unique), `ride` (ObjectId), `driver`, `passenger` (User refs), `lastMessageAt`, `lastMessagePreview` (NOT stored: keep only `lastMessageAt` to avoid duplicating text), `unreadDriver`, `unreadPassenger` (Number, default 0), `expiresAt` (= ride expiresAt, the hard departure+15min). Indexes: unique `{match:1}`; `{driver:1,lastMessageAt:-1}`; `{passenger:1,lastMessageAt:-1}`; `{ride:1}`; TTL `{expiresAt:1}` expireAfterSeconds 0.
  - `Message.js`: `conversation`, `sender`, `body` (String 1..500, trim), `clientMessageId` (String <=64), `readAt`, `expiresAt`. Indexes: `{conversation:1,createdAt:1}`; unique partial `{conversation:1,clientMessageId:1}`; TTL `{expiresAt:1}`.
  - `ReportedFlag.js` (collection name `reported_flags`): `reporter`, `reportedUser`, `conversation`, `message`, `snapshot: {text, senderId, sentAt, rideId, pickupLocation, destination, rideDate, departureTime}`, `reason` (enum or <=200 chars), `createdAt`, `purgeAt = createdAt + 15 days`. Indexes: TTL `{purgeAt:1}` expireAfterSeconds 0; unique `{reporter:1,message:1}` (one report per message per reporter); `{createdAt:-1}`.
  - `RateCounter.js`: `key` (e.g. `chat:send:<userId>`), `windowStart`, `count`, `expiresAt` TTL. Helper `utils\mongoRateLimit.js` `consume(key, {windowMs,max})` using atomic `findOneAndUpdate` upsert with `$inc`; returns allowed boolean. Middleware wrapper `middleware\userRateLimit.js` returning 429 + Retry-After.
  Verify: model tests (`backend\tests\chat.test.js`) assert `Model.collection.getIndexes()`/`syncIndexes` include TTL and unique indexes.

- [ ] B1.2 `backend\utils\chatHooks.js` (replace stubs, keep exports and call style):
  - `createChatForMatch(match)`: idempotent upsert keyed on `match._id` (`findOneAndUpdate` with `$setOnInsert`, upsert true); ride expiry copied from `match.expiresAt`. Swallow duplicate-key (11000).
  - `purgeChatForMatch(match)`: `deleteMany` messages for the conversation then delete conversation; idempotent. Reports are NOT deleted (own 15-day TTL).
  - `purgeChatsForRides(rideIds)` for ride deletion and cleanup.
  Verify: tests: accept -> conversation exists exactly once (double call safe); cancel -> conversation and messages gone; ride delete -> gone.

- [ ] B1.3 `backend\utils\chatAccess.js` `loadConversationForUser(req,res)`: validate ObjectId (invalid -> 404), load conversation, if not participant -> 404 (same body as not found), read-time expiry: if `conversation.expiresAt <= now` hard-delete conversation+messages (+ related ended match remains to TTL) and respond 410 `{success:false,message:'This chat has ended'}`. Also confirm the match is still ACCEPTED (else purge and 410). Returns `{conversation, role}`. Used by every chat route.

- [ ] B1.4 `backend\controllers\chatController.js` + `backend\routes\chatRoutes.js`; mount `app.use('/api/chat', require('./routes/chatRoutes'))` in `server.js`. All routes `protect`.
  - `GET /api/chat/conversations` -> list for caller (participant filter, `expiresAt>now`, sort lastMessageAt desc, limit 50). Response per item (field-by-field): `{id, matchId, rideId, role, otherParty:{name}, ride:{pickupLocation,destination,rideDate,departureTime}, unread, lastMessageAt, expiresAt}`. No ids of the other user's contact info, no email/phone. (other party `name` only.)
  - `GET /api/chat/unread-count` -> `{count}` (sum of caller's unread across live conversations) for the nav badge.
  - `GET /api/chat/conversations/:id/messages?after=<ISO|id>` -> `loadConversationForUser`; return up to 100 messages `{id, mine:boolean, body, createdAt}` (no sender id/object); then atomically mark the other party's messages read and zero the caller's unread counter.
  - `POST /api/chat/conversations/:id/messages` body `{body, clientMessageId}` -> validate string, trim, 1..500, reject control characters; per-user Mongo rate limit (e.g. 20 msgs/min) and per-conversation cap (e.g. 300 messages); idempotent on clientMessageId (11000 -> return existing); insert with `expiresAt = conversation.expiresAt`; `$inc` other party unread, set `lastMessageAt`; best-effort `push.notifyUser(otherId,'message')` hook (no-op until B2; wrap in try/catch, never fail the send).
  - `POST /api/chat/messages/:messageId/report` body `{reason?}` -> load message, `loadConversationForUser` semantics on its conversation, reject reporting own message (400), rate limit (e.g. 10/hour), create `reported_flags` snapshot, 201; duplicate -> 200 idempotent.
  - Lazy creation: `GET /conversations` ignores matches without conversation, but `messages` endpoints for a match id are not exposed; (accept path creates the chat).
  Responses never include `driver`/`passenger` user objects.
  Verify: `backend\tests\chat.test.js`: participant-only (404 for a third user on every route, 404 for bad id), 410 + hard delete when `expiresAt` in the past (set via DB update), send/idempotency/validation/rate limit 429, unread counters and read marking, report creates snapshot and duplicate is idempotent, own message report 400, no `email|phone|whatsapp` keys anywhere in any chat JSON (recursive key scan helper).

- [ ] B1.5 Admin report listing: `GET /api/admin/reports` (`protect, adminOnly`) in `backend\routes\adminRoutes.js` (+ `adminController.js`), paginated (limit<=50, `before` cursor), returns snapshot + reporter/reported user ids and names only. Also `GET /api/admin/chats` is NOT built (decision 7 says query via DB). Mount `/api/admin`.
  Verify: non-admin 403, admin 200, no contact fields.

- [ ] B1.6 Privacy masking:
  - `authController.js`: register/login/getMe return exactly `{id, name, role}` (drop email, phone, createdAt). Add `GET /api/auth/profile` (protect) returning `{name, email, phone}` for the caller only, and `PATCH /api/auth/profile` updating `name` (1..60), `phone` (validate with `phoneSanitizer.isValidPhoneNumber`/`sanitizePhoneNumber`, allow empty), `email` is NOT editable. Response of PATCH = same shape as GET. Wire in `authRoutes.js` with the in-memory rate limiter on PATCH.
  - `rideController.getRideById`: remove `whatsappNumber`, `whatsappLink`, `canContact` phone data; driver object id+name only. `getRides`/`getMyRides`: strip `whatsappNumber` from all responses (use `.select('-whatsappNumber')` or field-by-field mapping). Ride schema keeps `whatsappNumber` but make it optional (`required:false`) and `createRide` accepts but does not require it; the stored value is never returned to anyone (not even the owner; owner edits via profile phone). Decision 6 says the ride form field is retained so the driver can edit their own number: keep accepting `whatsappNumber` on create and store it, never return it. Update `rideController` validation accordingly.
  - Audit `matchController.js` views, `requestController.js` views, `roadStatusController.js` (author must be `{id,name}` only), and any `.populate(...)` to select only `name`.
  - Add `backend\utils\sanitizeUser.js` (`publicUser(u) -> {id,name}`) and use it in views.
  - Update existing tests that asserted phone exposure (`tests\api.test.js` ~line 222 and register/login shape assertions) to assert masking.
  Verify: `backend\tests\privacy.test.js`: recursive scan of responses from auth, rides (list, detail, mine), requests, matches, road-status, chat for any key matching `/email|phone|whatsapp/i` and for the actual seeded values; GET/PATCH profile returns own values only; PATCH validation.

- [ ] B1.7 Cron cleanup: `backend\controllers\cronController.js` + `backend\routes\cronRoutes.js`; mount `GET /api/cron/cleanup` (Vercel cron sends GET). Auth: header `Authorization: Bearer <CRON_SECRET>` compared with `crypto.timingSafeEqual` on equal-length buffers (hash both with sha256 first to equalize length); if `CRON_SECRET` unset -> 503/401 (fail closed). Work (idempotent, bounded batch sizes): delete expired Conversations+Messages (`expiresAt<=now`), delete messages without conversation, delete expired RideMatches, expired RideRequests past `purgeAt`, expired Rides, `reported_flags` with `purgeAt<=now`, expired RateCounters, run `reconcileSeats()`. Returns counts only. Update `backend\vercel.json` adding `"crons": [{ "path": "/api/cron/cleanup", "schedule": "0 0 * * *" }]`.
  Verify: tests: 401 without/with wrong secret, 200 with right secret (set `process.env.CRON_SECRET` in test), seeded expired docs deleted and fresh docs untouched, running twice is safe; `vercel.json` parses and contains the cron entry.

- [ ] B1.8 Full run `cd backend; npm.cmd test` green.

---
## SUB-PHASE B2: Backend push (verdict: `.agents\tasks\p4b2-review.json`)

- [ ] B2.1 `cd backend; npm.cmd install web-push --save-exact` (only package change; confirm `package.json` pins an exact version with no caret).
- [ ] B2.2 Model `backend\models\PushSubscription.js`: `user`, `endpoint` (unique), `keys:{p256dh,auth}`, `userAgent` (<=200), `createdAt`, `lastSuccessAt`, `failureCount`. Indexes: unique `{endpoint:1}`, `{user:1}`, TTL on `lastSeenAt` or `expiresAt` (90 days, refreshed on resubscribe).
- [ ] B2.3 `backend\utils\push.js`: lazily `webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)` only if all three env vars exist; `isConfigured()`; `notifyUser(userId, kind)` with kind in `'message' | 'offer'` -> fixed generic payloads `{title:'Carpool', body:'New message received'}` / `'New ride request'`, `data:{url:'/chat'|'/matches'}`; never any text/sender/ride info. No-op (resolves false) when unconfigured. 404/410 from push service -> delete subscription; other errors -> `failureCount++` and delete at >=5. Never throws; timeouts (`timeout: 5000`). Fire from: chat send (B1.4 hook), match creation (`createMatch`, notify the other party), accept/cancel optional (generic 'offer').
- [ ] B2.4 `backend\controllers\pushController.js` + `backend\routes\pushRoutes.js`, mount `/api/push`: `GET /public-key` (returns `{key}` or 204/`{key:null}` when unset; public key is not secret), `POST /subscribe` (protect; validate endpoint is https URL <= 512 chars and keys strings; upsert by endpoint reassigning to caller; cap 5 subscriptions per user), `POST /unsubscribe` (protect; delete by endpoint owned by caller). Per-user Mongo rate limit.
- [ ] B2.5 Tests `backend\tests\push.test.js` with `jest.mock('web-push')`: unset env -> no-op and `sendNotification` not called; set dummy fake env values inside the test only (clearly fake strings, restored after) -> payload exactly generic, contains no message text or names; 410 removes subscription; subscribe/unsubscribe validation, ownership, cap; public-key endpoint behavior; chat send triggers notify without failing when push throws.
- Verify: `cd backend; npm.cmd test`.

---
## SUB-PHASE C + B3: Frontend (verdict: `.agents\tasks\p4c-review.json`)
Follow existing patterns (Tailwind, lucide-react, axios `services\api.js`, contexts). Frontend must never hold email/phone in global state.

- [ ] C1. `frontend\src\services\api.js`: add `getConversations`, `getChatUnread`, `getMessages(id, after)`, `sendMessage(id,{body,clientMessageId})`, `reportMessage(messageId,{reason})`, `getProfile`, `updateProfile`, `getPushPublicKey`, `pushSubscribe`, `pushUnsubscribe`.
- [ ] C2. `context\AuthContext.jsx`: store only `{id,name,role}`; strip any other keys on login/register/me (defensive whitelist function in `frontend\src\utils\safeUser.js` + test). Remove usages of `user.phone`/`user.email` (`OfferRide.jsx` prefill -> fetch via `getProfile()` into local component state only, not context; or leave field blank). Register page still sends phone/email in request body only. Clear stale `carpool_user` localStorage keys containing email/phone on load. Existing sessions: forced fresh login if stored user lacks expected shape.
- [ ] C3. `context\ModeContext.jsx` (`mode: 'passenger'|'driver'`, `setMode`, persisted in localStorage `carpool_mode`, default 'passenger', validate stored value) + `components\ModeSwitcher.jsx` (segmented control, `role="tablist"`/aria-pressed, keyboard accessible) placed on Home/Feed and Active page header. Mode is UI filtering only; no API change. Wrap in `main.jsx`/`App.jsx`.
- [ ] C4. Mode-aware '+' FAB `components\FabMenu.jsx` on Home (`/`) and `/active`: Driver mode -> "Offer Ride" (`/offer-ride`); Passenger mode -> "Post Request" (`/request-ride`), plus "Find Rides" scroll/link. Hide for guests (redirect to login via ProtectedRoute).
- [ ] C5. `pages\Active.jsx` route `/active` (protected): Passenger mode -> my requests (reuse `MyRequests` content/components) and incoming driver offers (matches where I am passenger); Driver mode -> my rides (reuse `MyRides` components) and incoming passenger join requests + passenger Requests board link. Keep existing routes `/my-rides`, `/my-requests`, `/requests`, `/matches` working (redirect or reuse).
- [ ] C6. `components\BottomNav.jsx`: exactly 4 items: Home (`/`), Active Rides (`/active`), Chat (`/chat`, unread badge from `context\ChatUnreadContext.jsx` polling `getChatUnread` every ~30 s while visible and authenticated, modeled on `AlertContext.jsx`), Profile (`/profile`). Remove Roads and Offer from nav; keep `/road-status` route and page. Guests: Profile slot links to `/login`.
- [ ] C7. `pages\Profile.jsx` (protected): shows name, own phone/email fetched via `getProfile()` into local state only (cleared on unmount), edit name/phone via PATCH, logout button, link to `/road-status` (Roads), push enable/disable toggle (uses `lib\push.js`: `Notification.requestPermission`, `serviceWorker.ready.pushManager.subscribe({userVisibleOnly:true, applicationServerKey})`, hidden if unsupported or server key null; iOS hint "Add to Home Screen first").
- [ ] C8. PWA push handler: with vite-plugin-pwa use `injectManifest` OR add an imported `push-sw.js` through `workbox.importScripts` in `vite.config.js` (choose the least invasive after reading `vite.config.js`; keep API routes `NetworkOnly`). Handler shows generic notification and on click focuses/opens `data.url`.
- [ ] C9. Chat UI: `pages\ChatList.jsx` (`/chat`, protected; conversations from `getConversations`, shows ride summary, other party name, unread dot, empty state), `pages\ChatThread.jsx` (`/chat/:id`; polls `getMessages` every ~4 s only when `document.visibilityState==='visible'` and route mounted, backoff on errors, stop on 404/410 with "This chat has ended" and navigate back; send box with 500-char limit, `crypto.randomUUID()` clientMessageId, optimistic append; render text only via React escaping, `whitespace-pre-wrap`, no HTML; per-message "Report" action for the other party's messages with confirm modal (`ConfirmationModal`); persistent safety note: "Never share personal numbers or payment details. Messages are not end-to-end encrypted and chats are deleted after the ride."). Add "Open chat" link on ACCEPTED matches in `Matches.jsx`/Active page using conversation lookup (match->conversation via list).
- [ ] C10. `pages\RideDetails.jsx`: remove WhatsApp button, `ride.whatsappLink` use and WhatsApp wording; replace with "Request to Join" flow already built in P3 and a chat-after-accept note. Update copy in `Home.jsx`, `MyRides.jsx` tooltip, `OfferRide.jsx` ("WhatsApp Contact" field kept but labeled as private; never shown to others).
- [ ] C11. Routes in `App.jsx`: `/active`, `/chat`, `/chat/:id`, `/profile` (protected). Keep `/road-status` public.
- [ ] C12. Frontend tests (`frontend\tests\*.test.js`, node:test, pure functions): `safeUser` whitelist, mode persistence validator (`modeStore.js` pure get/set with injected storage), chat message validation/clientMessageId helper, nav config (exactly 4 items, none is Roads), unread badge formatting (99+).
- Verify: `cd frontend; npm.cmd run lint; npm.cmd test; npm.cmd run build` all succeed. Re-run `cd backend; npm.cmd test`.

---
## NEW ENDPOINTS / COLLECTIONS / INDEXES (record)
Endpoints: `GET/PATCH /api/auth/profile`; `/api/chat`: `GET conversations`, `GET unread-count`, `GET conversations/:id/messages`, `POST conversations/:id/messages`, `POST messages/:id/report`; `GET /api/admin/reports`; `/api/push`: `GET public-key`, `POST subscribe`, `POST unsubscribe`; `GET /api/cron/cleanup`.
Collections: `conversations`, `messages`, `reported_flags` (15-day TTL via `purgeAt`), `pushsubscriptions`, `ratecounters`. Changed: `ridematches.seatsReserved`.
Indexes: conversations unique `{match}`, TTL `{expiresAt}`, `{driver,lastMessageAt}`, `{passenger,lastMessageAt}`; messages `{conversation,createdAt}`, unique partial `{conversation,clientMessageId}`, TTL `{expiresAt}`; reported_flags TTL `{purgeAt}`, unique `{reporter,message}`; pushsubscriptions unique `{endpoint}`, `{user}`, TTL; ratecounters TTL `{expiresAt}`; ridematches `{status,seatsReserved,expiresAt}`.

## DEPLOY STEPS
1. Vercel env vars (backend project): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:you@example.com`), `CRON_SECRET` (long random string). The user generates the VAPID pair themselves (`npx web-push generate-vapid-keys`) and enters them in Vercel; never commit them. Without them push is a silent no-op and the cron returns 401/503.
2. Deploy backend; Mongoose creates TTL/unique indexes on first connection (autoIndex). Confirm in Atlas that TTL indexes on `conversations`, `messages`, `reported_flags`, `ratecounters`, `pushsubscriptions` exist.
3. Cron: `backend\vercel.json` `crons` entry `/api/cron/cleanup` at `0 0 * * *` (05:00 PKT; Hobby allows once per day). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when the `CRON_SECRET` env var is set. Verify under Project > Settings > Cron Jobs after deploy.
4. Deploy frontend (new service worker push handler; users get the update prompt).
5. iOS caveat: Web Push on iPhone works only for the PWA added to the Home Screen (iOS 16.4+); Android Chrome is best effort. In-app unread badge is the primary fallback.
6. Existing clients need a fresh login: `/auth/*` no longer returns phone/email, and the stored user shape changes. Old tokens still work, but the frontend re-fetches `/auth/me` and drops stale stored fields.
7. Existing PENDING/ACCEPTED matches created before `seatsReserved` exists: ACCEPTED legacy matches lack `seatsReserved:true`, so cancelling them would not restore seats. Run once after deploy a migration-style step (script `backend\scripts\backfill-seats-reserved.js`, dry-run by default): set `seatsReserved:true` on all ACCEPTED matches not expired. Include this script in sub-phase A (add as A6) with a test.

## Risk notes / assumptions
- Brief ACCEPTED-with-reserved-seats window before the request becomes MATCHED is accepted (seats are real; compensation exists).
- Rate limits for chat are Mongo-backed (cross-instance); auth limiter remains best-effort in-memory.
- Chat is plain text; admins read via DB. Reports store snapshots for 15 days only.
- Not verifiable here: real Web Push delivery, Vercel cron execution, iOS behavior (no browser automation, no production access).
