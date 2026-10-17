# Investigation: Mode data (Bug 1) and missing contact (Bug 2)

Status: READ-ONLY investigation. No project file was edited. Date of working tree: current. Only this report was created.
Scope read: all files cited below (backend controllers, models, routes, utils; frontend pages, components, contexts, utils; plan and P4C verification docs).

## 0. Summary answer

**Bug 1 (same data in both modes) is a frontend implementation gap, not a data or backend bug.**
`frontend\src\pages\Feed.jsx` (route `/`, the real home screen) calls `api.get('/rides', ...)` unconditionally in `fetchRides` (line 83) and renders only `<RideCard>` (line 408). `useMode().isDriver` is read, but it only toggles the filter panel (line 284), two shortcut links (lines ~205-211), params (line 59) and empty-state copy. No code path in Feed ever calls `/api/requests`. So Driver Mode and Passenger Mode show the identical `GET /api/rides` list. This was a documented P4C choice ("Feed keeps the public ride list visible in both modes; only the action buttons change", `p4c-verification.md`), which no longer matches what the user expects.
The backend is correct: Rides and RideRequests are separate collections with separate endpoints, so a ride can never be returned by `/api/requests` and vice versa. No type/role field is needed.

**Bug 2 (no contact option) has three stacked causes, and the chat backend itself works:**
1. By approved design (FINAL DECISIONS 3), a chat exists only after a match is ACCEPTED. There is no direct "Message" action anywhere. The only route to a chat is: send Join/Offer, other side taps Accept, then "Open chat" appears in Offers & Requests (`Matches.jsx`).
2. The entry points for that flow are weak or hidden:
   - Passenger request cards (`Requests.jsx`, line 237) are not links and have no detail page. Their only action is a button labelled "Offer my ride" (line 254). It opens a picker that shows "You have no eligible ride on this date" unless the driver already has an ACTIVE, same-date, same-vehicle-class ride with enough free seats.
   - The `/requests` page is reachable only via Driver-mode shortcut links in Feed (line 209) or Active; it is not in the bottom nav.
   - On `RideDetails.jsx` the "Request to Join" block is rendered only for a logged-in NON-owner (line 272). The label says "Request to Join", not "Message/Contact Driver".
3. **Most likely reason the user saw nothing in the test:** both test entries were probably created from the same account. Then: the ride is the viewer's own (Join block hidden, line 272), the request is the viewer's own (excluded from `GET /api/requests` by `passenger: { $ne: req.user._id }`, `requestController.js` line 343, so it never appears in the driver's Passenger Requests list), and self-offers are rejected (`matchController.createMatch`, "You cannot offer a ride to yourself"). With two accounts the buttons do appear but are labelled in a way users do not read as "contact".

Not verified by running: I attempted to run the backend Jest suite from the terminal, but the shell tool returned no usable output (known quirk), so I could not capture a fresh pass count. The last recorded run (p4c/p5 verification docs) was 137 backend tests passing; treat as "last known", not re-confirmed. I could not run the browser UI or read the production database.

## 1. Bug 1: evidence and root cause

### 1.1 Data model (question 1)
- `backend\models\Ride.js`: collection `rides`, driver ride (`driver`, `rideDate`, `departureTime`, `availableSeats`, `vehicleType` default CAR, `pricePerSeat`, status ACTIVE|FULL|CANCELLED).
- `backend\models\RideRequest.js`: separate collection `riderequests`, passenger request (`passenger`, `requestDate`, `departureTime`, `vehiclePreference` BIKE|CAR required, `passengerCount`, status ACTIVE|MATCHED|CANCELLED, EXPIRED derived at read time).
- Conclusion: distinct models. A type/role discriminator is unnecessary and would be a duplicate. Do not add one.

### 1.2 Endpoints per mode (question 2)
| Mode | Home (`/`, Feed.jsx) | Other screens |
|---|---|---|
| Passenger | `GET /api/rides` (driver rides). Matches the earlier design "Find Rides". | Active: `MyRequests` (`GET /api/requests/mine`) + link "Find Rides" to `/` |
| Driver | **Same** `GET /api/rides` (own rides included, nothing excludes them) | Active: `MyRides` (`GET /api/rides/my-rides`) + link "Browse Passenger Requests" to `/requests` (`GET /api/requests`) |

`Home.jsx` is not routed in `App.jsx` (dead page). `services\api.js` has `getRequests`, `getMyRequests` but Feed never uses them.

### 1.3 Backend (question 3)
- `rideController.getRides` (public, `optionalAuth`): ACTIVE, `departureDateTime > now-15min`, `availableSeats > 0`, plus validated date/vehicle/time/seat/pickup/destination filters. Returns only rides. Strips `whatsappNumber`. Correct.
- `requestController.getRequests` (protected): ACTIVE, `expiresAt > now`, `passenger != caller`, filters date/vehicleType/time/keyword/passengers (max 100). Returns only requests, first name only. Correct. Note: it deliberately hides the caller's own requests (own ones come from `/mine`).
- `matchController`: unrelated to listing.
- No status or query bug found that makes the two lists collide.

### 1.4 Shared state / caching (question 4)
- `ModeContext.jsx`: mode in React state + `localStorage('carpool_mode')`, default `passenger`. Not a data cache.
- Feed's `rides` state is local to Feed; its fetch effect (line 69) depends on date/vehicle/params and NOT on mode, so even after adding a second data source the effect must be extended with `mode`.
- Service worker: `/api/` is `NetworkOnly` (p4c doc), so no stale API data is cached. React Query/SWR are not used.
- Stale-on-switch is not the cause; the data source simply never changes.

### 1.5 Same component for both lists (question 5)
Yes: `RideCard` is the only card Feed renders. A request card exists only inline in `Requests.jsx`. There is no shared card component and no mode-aware list component.

### 1.6 Existing test data (question 6)
- Cannot read the production DB. By schema: a driver-mode submission can only create a `Ride` (`POST /api/rides` via OfferRide) and a passenger-mode submission only a `RideRequest` (`POST /api/requests` via RequestRide). `fabConfig` maps driver to `/offer-ride`, passenger to `/request-ride`. Misclassification across collections is structurally impossible.
- Field checks to make on real data (read-only, see section 6): ride `vehicleType` may be missing on legacy rides (treated as CAR everywhere via `getVehicleType`); request `vehiclePreference` is required. Legacy rides created before the time-zone fix carry `timeShiftedAt` unset and may be 5 h off (decision 1 migration `scripts\migrate-shift-times.js`, dry-run by default). If that migration was not run in production, a test ride could land on the wrong Today/Tomorrow tab. That is a separate, already-known issue and not the cause of Bug 1.
- Expected state of the user's test: 1 `rides` doc + 1 `riderequests` doc, possibly under the same user id.

### 1.7 Loading, empty and error states (question 7)
Feed handles loading (`LoadingSkeleton`), offline (`OfflineNotice`), error with Retry, and empty with a mode-aware CTA, with out-of-order response protection (`requestId` ref). `Requests.jsx` has loading, offline, error and empty states but no Retry on the error state. Both are reusable patterns for the fix.

### 1.8 Root cause (precise)
`frontend\src\pages\Feed.jsx`:
- line 83: `api.get('/rides', { params })` runs regardless of mode;
- lines 407-410: list is always `RideCard`s of `/rides`;
- `isDriver` (line 25) never selects a different endpoint.
Secondary contributors: `Requests.jsx` hides own requests (backend line 343) and is not linked from the Passenger-mode home, and the product expectation changed after P4C.

## 2. Bug 1: what does the user mean? Options

User text: Driver Mode = "rides offered by drivers"; Passenger Mode = "travel requests created by passengers... do not display driver ride listings as passenger requests". User test: created one ride (Driver) and one request (Passenger), saw the ride in Passenger Mode.

| Option | Driver Mode home | Passenger Mode home | Fits final decisions | Pros | Cons |
|---|---|---|---|---|---|
| A. Own entries only | My rides | My requests | Yes (that data exists: `/my-rides`, `/mine`) | Matches the user's test literally | Duplicates Active Rides page; loses discovery (no way to find rides or requests from home) |
| B. Literal public feeds | All driver rides | All passenger requests | Partly. Decision 12 says drivers see all requests, but passengers browsing other passengers' requests has no purpose and no action | Matches the literal wording | Passenger sees requests they cannot act on; driver sees rides they cannot act on; breaks Offer/Join logic |
| C. Discovery by role (current design) | Passenger requests to respond to | Rides to join | Yes (decisions 3, 12) | Each mode shows what the user can act on | Contradicts the user's wording for Passenger Mode (still shows driver rides) |
| D. Mode-scoped two-tab home (recommended) | Tab 1 "My Rides" (own), Tab 2 "Passenger Requests" (discovery, `/api/requests`) | Tab 1 "My Requests" (own), Tab 2 "Available Rides" (discovery, `/api/rides`) | Yes | Satisfies "Passenger Mode shows passenger requests, Driver Mode shows driver rides" for the user's own entries AND keeps discovery; keeps Today/Tomorrow/custom date + vehicle filters on discovery tabs; reuses existing endpoints, no new collection | Home gets a tab bar; slightly more UI work |

**Recommendation: D**, default tab = the user's own entries ("My Requests" / "My Rides"), discovery one tap away. Reasoning: it is the only option that makes the user's test pass (their own passenger request appears in Passenger Mode, their ride in Driver Mode), never shows driver rides inside the passenger-request area, and preserves the approved mutual-consent discovery flow. Needs the user's confirmation (Open question 1).

If the user prefers Option C unchanged, the "fix" for Bug 1 is only copy/labelling; I do not recommend it since the user explicitly reported it as a bug.

## 3. Bug 2: what exists (chat backend and frontend)

### 3.1 Backend chat exists and is complete
- Routes `backend\routes\chatRoutes.js` (all behind `protect`): `GET /conversations`, `GET /unread-count`, `GET /conversations/:id`, `GET /conversations/:id/messages?after=`, `POST /conversations/:id/messages`, `POST /messages/:id/report`.
- Controller `chatController.js`: list/get/send/poll/unread/report; plain-text sanitize, 500 char cap, idempotent `clientMessageId`, 20 msg/min Mongo-backed limit, 300 msg/conversation cap, generic push.
- Gate `utils\chatAccess.loadConversationForUser`: non-participant or unknown id gives identical 404; read-time expiry: if conversation expired, ride gone/cancelled/expired, or match not ACCEPTED, hard-delete and return 410.
- Creation `utils\chatHooks.createChatForMatch`: called only from `matchController.acceptMatch`; upsert on `{ match }` so a match never has two chats.
- Models: `Conversation` requires `ride` and `match`; unique index `{ match: 1 }`, TTL on `expiresAt`. `Message` has `clientMessageId`, `expiresAt`.
- Frontend: `ChatList.jsx`, `ChatThread.jsx` (header with pickup to destination, date, time, vehicle, other party first name + role label; message list with timestamps; Send; sending/sent/failed + Retry; load error; "chat ended" state; Back link; report dialog; polling 4 s visible, paused hidden), `ChatUnreadContext`, bottom nav "Chat" with unread badge, `/chat` and `/chat/:id` routes in `App.jsx`.
- Tests (`backend\tests\chat.test.js`): chat only after ACCEPTED; 401/404 on every route for strangers; read-time 410; masking test (no email/phone/whatsapp in ride, request, match, chat responses); report snapshot; cron cleanup. Last recorded total: 137 passing.

So the chat does work end to end in tests (not confirmed in a real browser: p4c-verification lists the live flow accept -> Open chat -> send -> report as NOT verified).

### 3.2 What a user sees today, per card, per mode, owner vs non-owner

| Screen / card | Viewer | What is rendered |
|---|---|---|
| Feed ride card (both modes) | anyone | Whole card is a link to `/rides/:id` (RideCard.jsx). Only driver first name shown. No buttons on the card. |
| `/rides/:id` RideDetails | Guest | Details + big "Log in to Request a Seat" (RideDetails.jsx, end of file) |
| | Logged-in non-owner, seats > 0 | "Request to Join" block: optional "link one of your requests" (only requests matching same date AND same vehicle type, status ACTIVE), seats picker, "Request to Join" button. No chat/contact wording. |
| | Logged-in non-owner, 0 seats / not ACTIVE | amber text "You cannot request this ride: it has no seats left." (and the ride is usually not listed or fetchable) |
| | Owner (same account) | **Nothing** (line 272 hides the block). Looks like contact is missing. |
| `/requests` card (Driver mode path only) | Driver (non-owner of request) | Static card (not a link), button "Offer my ride" -> picker of own eligible rides. Empty picker text: "You have no eligible ride on this date, post one first." |
| | Request owner | Own requests are not listed at all (backend filter). Seen only in `MyRequests` (Active, Passenger mode) with "Possible matches (n)" link, no contact action. |
| `/requests/:id/matches` RequestMatches | Request owner | Per suggested ride: "Request to Join" button (first-name driver). Good entry, but only reachable from MyRequests. |
| `/rides/:id/matching-requests` RideMatchingRequests | Ride owner | Suggested requests with offer action (reachable from MyRides). |
| Active -> Offers & Requests (`Matches.jsx`) | both | Incoming Accept/Decline, outgoing Cancel, and after ACCEPTED an "Open chat" link. |

Conclusion on visibility: the Join/Offer buttons exist but (a) hidden for same-account testing, (b) labelled as transactional, not "contact", (c) request cards give no way to open a "details" view, (d) `/requests` is hard to find from Passenger mode.

### 3.3 Consent design vs user expectation
FINAL DECISIONS 3, 5 and the `chatAccess` read-time check (`match.status !== 'ACCEPTED'` kills the chat) intentionally prevent unsolicited chat. The user now asks for a direct "Contact/Message" button that opens a conversation "associated with the correct passenger request or ride". These conflict unless the button is defined as "send an offer/join with a short intro". I did not override the approved decision.

### 3.4 Chat options

#### Option 1 (recommended): keep mutual consent, surface the CTA, add an optional short intro note
- UX: Ride card/details for passengers: button "Message Driver" (subtitle "Sends a request. Chat opens when the driver accepts"). Request cards for drivers: button "Message Passenger" (opens the existing picker, then sends an offer). Optional note field, max 140 chars. After sending: pending state "Waiting for driver/passenger" with link to Offers & Requests. After ACCEPT: "Open chat" appears (already exists). Optionally seed the note as the first chat message on acceptance.
- DB: add `note: { type: String, maxlength: 140, default: '' }` to `RideMatch` (backwards compatible, no migration). Purges with the match (TTL = ride expiry; deleted on cancel).
- Endpoints: `POST /api/matches` accepts optional `note`; sanitize with the same control-character stripping as `chatController.sanitizeBody` (export it); `buildMatchView` returns `note` to the responder only after the match is visible to them (already party-only). No new routes.
- Frontend: `RideDetails.jsx` (rename + note + "pending" state if `existingMatch`; also show a clear message for owners such as "This is your ride. Passengers will message you here."), `Requests.jsx` (rename button, add note in `OfferPicker`, make card show clear next steps), expose request details route or expand inline, `Matches.jsx` show note.
- Privacy/authorization: unchanged; no phone leaks since `note` is user free text (add a UI hint "Do not share phone numbers"; the existing report flow applies after chat; for the note itself, consider a simple phone-pattern warning, optional). Backend authorization still participant-only 404.
- Purge: automatic with the match (no new job).
- Risk to tests: very low (additive field). Add tests for note validation and view.
- Effort: small to medium (about 1 to 1.5 days incl. tests).

#### Option 2: pre-acceptance "intro" thread with strict limits
- A conversation exists before acceptance, bound to the ride (or request).
- DB: `Conversation.kind` ('MATCH' | 'INTRO'); make `match` optional; add `request` ref; unique partial index `{ ride, passenger }` for INTRO to reuse the thread; `contextSummary` from request when no ride. `chatAccess` must branch (today it requires an ACCEPTED match, otherwise deletes the chat).
- Rules needed: max N intro messages from the initiator until the other side replies, per-user daily cap, block on decline, purge at ride/request expiry.
- Request-context representation (no ride exists): a conversation with `ride: null`, `request: <id>`, `kind: 'INTRO'`, `passenger = request.passenger`, `driver = the contacting driver`; unique on `{ request, driver }`; `expiresAt = request.expiresAt`; purge hooks in `cascadeCancelForRequest`, `deleteRequest`, `deleteRequestSeries`, cron sweep, and read-time check using the request instead of the ride. A request is not treated as a ride: ride-specific code (seat reservation, `Conversation.ride` required, `createChatForMatch`) is untouched.
- Spam/privacy: any registered user can message any passenger/driver (harassment surface); contradicts decisions 3 and 5; the 410/404 gates must be rewritten.
- Risk to tests: high (chat tests assert no chat before ACCEPTED, `chatAccess` semantics change). Effort: large (3 to 5 days).

#### Option 3: direct chat bound to a ride, ride cards only
- Passenger taps "Message Driver" on a ride; a conversation `(ride, passenger)` is created immediately.
- DB: `match` optional; unique `{ ride, passenger }`; seat logic untouched (chat does not reserve seats, so users could agree on a seat that is not reserved).
- Requests: still no chat (so "Message Passenger" cannot be offered). Partial and inconsistent with the user's request A.
- Risk: moderate (changes `chatAccess` and the "chat only after ACCEPTED" tests); effort medium (2 to 3 days). Bypasses driver consent.

#### Recommendation
Option 1. It satisfies every stated user outcome except an instantly open chat, keeps the approved privacy model, reuses the working chat, and needs one additive field. If the user truly wants instant chat, ask them to explicitly supersede FINAL DECISION 3 and choose Option 2 (for request context) or 3 (rides only).

## 4. Authorization and privacy verification (by code and tests)

| Requirement | Evidence | Status |
|---|---|---|
| Only authenticated users | `router.use(protect)` in `chatRoutes.js`; `requestRoutes.js` `router.use(protect)`; matches routes protected; test "unauthenticated 401 ... on every route" | OK |
| Participants only, 404 for others | `chatAccess.loadConversationForUser` returns the same 404 for unknown/malformed/non-participant; `loadParticipantMatch` in matchController same; report route maps non-participant to 404; test "non-participant 404 on every route" | OK |
| Cannot change a URL/ride id to see another chat | Conversation looked up by id then checked against `driver`/`passenger`; no ride-id keyed chat endpoint exists | OK |
| Self-chat prevented | `createMatch`: owner of ride must supply a request (`A request is required to make an offer`), and `request.passenger === caller` gives 400 "cannot offer a ride to yourself"; non-owner cannot target own request (`Request not found`). Also `getRequests` excludes own requests and matching excludes own rides | OK |
| Duplicate conversation reuse | `Conversation` unique index `{ match: 1 }` + upsert in `createChatForMatch`; match unique partial index `{ ride, passenger }` for PENDING/ACCEPTED, so a second click returns 409 "already a pending or accepted offer"; `clientMatchId` makes retries idempotent | OK |
| Expired / cancelled lifecycle | Read-time 410 + hard delete (ride expiry+15 min, ride gone/cancelled, match not ACCEPTED); cascade purge on cancel/delete; daily cron | OK |
| No phone/WhatsApp leakage | Grep over `backend\controllers`, `utils`, `routes`: `whatsappNumber` is only written in `createRide` and always `.select('-whatsappNumber')` in `getRides`, `getRideById`, `getMyRides`, `getMatchesForRequest`; no `wa.me` anywhere in `frontend\src`; `chatController` builds responses field by field (first name + role label only); `AuthContext` keeps only `{ id, name, role }`; test "no email/phone/whatsapp in ride, request, match, chat or conversation responses". Phone is returned only by `GET /auth/profile` to its owner (Profile page) | OK |
| Mode as security boundary | None. `ModeContext` comment states backend authorizes regardless | OK |

Minor findings (not blocking):
- `getRideById` returns `canContact` (boolean) that the UI ignores. Harmless but misleading; remove or use when wiring the button.
- `GET /api/rides` is public and returns `driver.id` (user ObjectId) to guests. This is an id, not contact data, but it is stable identifying data; consider dropping it from the list response now that RideDetails already receives `driver.id` (needed only for the owner check). Open question 7.
- Phase impact for Option 1: free text `note` could contain a phone number typed by a user; this is a user choice, but add a UI hint and rely on reporting.

## 5. Smallest safe solution per bug

### Bug 1 (frontend-only unless the user prefers otherwise)
1. Add a mode-aware home: in `Feed.jsx`, read `mode`; add a two-tab control per mode (see Option D). Extract the discovery list for requests into a shared card/list component reused by `Requests.jsx` (remove the duplication).
2. Data sources: Passenger: `getMyRequests()` (own) and existing `/rides` discovery. Driver: `getMyRides()` (own, exists in `MyRides.jsx`) and `getRequests()` with the same date + vehicle filters (backend already supports `date`, `vehicleType`, `timeFrom/timeTo`, `keyword`, `passengers`).
3. Include `mode` and active tab in the fetch effect deps and in the `requestId` guard; clear list on switch to avoid flashing the previous mode's data; keep the Today/Tomorrow/custom date and vehicle filters; reuse loading/empty/error/offline states.
4. Backend: no change required. Optional: let `GET /api/requests` accept the same `date` default behaviours already present.
5. Tests: add pure tests for a small `utils/homeFeed.js` (maps `{mode, tab}` to endpoint + params), plus source-wiring test (Feed does not use `RideCard` in the passenger-request tab). The existing frontend tests are pure `node:test` files (no React DOM).

### Bug 2 (Option 1)
1. Backend: add `RideMatch.note` + validation/sanitization in `createMatch`; include `note` in `buildMatchView`; tests.
2. Frontend: relabel and surface CTAs ("Message Driver" on RideDetails, "Message Passenger" on request cards); note textarea with counter; pending/accepted state (`existingMatch`); show the note in `Matches.jsx`; make request cards expandable or add `/requests/:id` details so there is "something to click"; owner message: "This is your own ride/request" so same-account testers understand.
3. Wire the post-send message to open `Matches` ("Track it in Offers & Requests") and, after acceptance, the existing "Open chat".
4. Do NOT reintroduce the WhatsApp button.

## 6. Test data: misclassification check and safe correction

- No evidence of misclassification: separate collections and endpoints.
- Safe read-only verification (user runs in Atlas or via a read-only script; I did not touch production): count `rides` and `riderequests`; list `_id`, owner id, dates, `vehicleType` / `vehiclePreference`, `status`, `timeShiftedAt` (no names/phones). Confirm whether both test docs share one owner id.
- If both belong to one account: no data fix needed; test with two accounts (or add a second account).
- If a legacy ride lacks `vehicleType`: no action (treated as CAR).
- If rides appear 5 h off: use the existing dry-run migration `scripts\migrate-shift-times.js` after the user approves a run; never run it on production without approval.
- No production data change is proposed or needed. Any correction would require a written approval step.

## 7. Risks to existing functionality
- Feed restructure touches the home route used by all flows; keep `RideCard` and `Feed` filters behaviour unchanged for the discovery tab to protect existing tests and users.
- Adding `note` to RideMatch affects match views consumed by `Matches.jsx` (additive only).
- Do not change `chatAccess` or the Conversation index unless Option 2/3 is chosen.
- The PWA service worker caches the app shell: after deploying frontend changes users must pick up the update (`UpdatePrompt` exists).
- Unrun tests: this investigation could not execute the test suites (terminal output unavailable). Re-run `backend: npm test` and `frontend: npm run lint && npm run build && npm test` before and after the fix.

## 8. Proposed test plan

Automated (backend, Jest + supertest + mongodb-memory-server, existing harness):
1. Rides vs requests separation: create a ride and a request for the same user; assert `GET /api/rides` returns only the ride and `GET /api/requests` (as a second user) only the request; `GET /api/requests/mine` only the request.
2. Filters: date, vehicleType and time filters still work on both endpoints (existing tests extended).
3. RideMatch note: valid note stored/returned to both parties only; > 140 chars 400; control chars stripped; non-string 400; replay by `clientMatchId` unchanged.
4. Self-chat/self-offer rejections, duplicate click returns 409, decline blocks resend (existing tests stay green).
5. Authorization: stranger gets 404 on match accept/decline/cancel and chat routes (existing; extend for `note`).
6. Privacy regression: extend the masking test to include `note` in responses and ensure no `whatsappNumber`/`phone`/`email` anywhere.

Automated (frontend, `node:test`):
7. Pure `homeFeed` mapping (mode/tab to endpoint and params); button labels / copy helpers; source-wiring checks that `Feed.jsx` passes `mode` into the fetch dependencies, that no `dangerouslySetInnerHTML` is added, and that there is no `wa.me` string.
8. `npm run lint` and `npm run build`.

Manual (two accounts A and B, two browsers; mobile width 390 px):
9. A offers a ride (Driver Mode); B posts a request (Passenger Mode). Confirm: Driver Mode home shows A's ride and Passenger requests discovery; Passenger Mode home shows B's request and available rides (as separate tabs), never mixing.
10. Switch modes repeatedly: lists change immediately; no flash of the other mode's data; filters (Today/Tomorrow/custom date/vehicle) apply.
11. B opens A's ride: "Message Driver" sends a request with a note; A sees an alert, accepts; both see "Open chat"; send messages both ways; timestamps; back button; chat list.
12. A opens B's request: "Message Passenger" -> picker -> offer with note -> B accepts -> chat opens.
13. Same-account case shows a helpful "this is your own ride/request" message.
14. Cancel after accept: chat disappears, seats restored. Expired ride: chat shows "ended".
15. Privacy: inspect network responses for phone/WhatsApp fields; confirm none.
16. Offline/error states on each tab; empty states.

## 9. Conclusions

### (1) Root cause of Bug 1
`frontend\src\pages\Feed.jsx` always fetches `GET /api/rides` (line 83) and renders only `RideCard`s (line 408); the Driver/Passenger mode only changes filters/links. Backend and data model are correct and separate.

### (2) Root cause of Bug 2
No direct contact action exists by design (chat opens only after ACCEPTED mutual consent), and the entry points that do exist ("Request to Join", "Offer my ride") are not presented as contact, request cards have no details/link, `/requests` is poorly discoverable from Passenger mode, and owners (same-account test) see no action at all. The chat backend and UI are implemented and authorized correctly.

### (3) Recommended minimal fix plan
Bug 1:
- Phase 1: confirm product semantics (Q1); add `utils/homeFeed.js` + tests.
- Phase 2: rebuild Feed as mode-scoped two-tab home (own + discovery), keep filters, states and `requestId` guard; reuse request card from `Requests.jsx`.
- Phase 3: manual verification with two accounts; frontend build/lint/test.
Bug 2 (Option 1):
- Phase 1: backend `RideMatch.note` + tests.
- Phase 2: relabel and surface CTAs (RideDetails, Requests/OfferPicker), pending/accepted states, own-item messaging, request details.
- Phase 3: show note in Matches; optional seeding of first chat message; manual end-to-end with two accounts.
- Phase 4 (only if requested): Option 2 or 3 after the user supersedes decision 3.

### (4) Open questions for the user
1. Product semantics for Bug 1: do you want (A) only your own entries per mode, (B) public feeds by entry type, (C) the current discovery-by-role, or (D) two tabs per mode (own + discovery, default = own)? I recommend D.
2. Were the two test entries created from the same account? If yes, should we add a clear "this is your own ride/request" message and test with two accounts?
3. Consent vs direct contact: keep the approved mutual-consent chat (recommended Option 1: "Message Driver/Passenger" sends a request with an optional short note, chat opens on acceptance), or explicitly supersede decision 3 for an instant chat (Option 2 or 3)?
4. If a note is added: max length (suggest 140 chars), and should it also appear as the first chat message after acceptance?
5. Should a passenger be able to message a driver even when the ride has 0 seats left (currently blocked) and should a driver be able to offer when their only same-date ride is full?
6. Should passenger requests become clickable with a details view (needed for "click a request card")?
7. Should `driver.id` be removed from the public `GET /api/rides` list (it is an internal id, not contact data)?
8. In Passenger Mode, should the discovery tab remain "Available Rides" (driver rides)? You asked for passenger requests in Passenger Mode; please confirm that means "my requests" and not other passengers' requests.
9. Do you approve a read-only database check of the two test records (owner ids, dates, `vehicleType`/`vehiclePreference`) before deploying? No data will be changed without your approval.
10. Has the time-zone migration (`scripts\migrate-shift-times.js`) been run on production? It affects which date tab a test ride appears under.
