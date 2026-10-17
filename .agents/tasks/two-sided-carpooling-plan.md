# Two-Sided Carpooling: Analysis and Proposed Plan

Status: APPROVED. Final decisions below are the source of truth. Implementation proceeds one phase at a time (P0 first), with review between phases.
Progress: P0-P5 DONE (P4 = seat-race fix, chat/privacy/reports/cron, push, mode switcher, 4-item nav, Profile, chat UI; P5 = matching engine + match endpoints + filters + matching UI, see "P5 DONE" at the end; pending final review). Option D home + chat alignment done (see modes-chat-fix-verification.md). Next: P6 (remaining polish only). See "DEPLOY STEPS (P4)" at the end. See "P2 deploy notes" and "P3 DONE" at the end of section 9.
Project root: `d:\Mubashir\carpooling\carpooling` (backend `backend\`, frontend `frontend\`).
Note: the git repo root is `d:\Mubashir\carpooling` and its single commit is older than the working tree. The working tree has newer files (road status, PWA, install components). This report is based on the working tree.

---

## FINAL DECISIONS (source of truth, supersedes earlier proposals and open questions)

Approved by the user. Where any later section conflicts with this list, this list wins.

1. Time: all users are in Pakistan (Asia/Karachi, UTC+5, no DST). Store UTC in MongoDB; parse user-entered date+time as +05:00; frontend displays Asia/Karachi. A one-off migration script (dry-run by default) shifts existing ride `departureDateTime`/`expiresAt` by -5 hours. No legacy chats exist, so nothing to purge. Database is MongoDB (not SQL).
2. Hosting: Vercel serverless + MongoDB Atlas free (512 MB). No WebSockets; chat uses short polling (about 4 s, only while the chat screen is visible).
3. Chat requires mutual consent, never open chat. Flow A: driver taps "Offer my ride" on a passenger Request, passenger gets an alert, passenger taps Accept, chat opens. Flow B: passenger taps "Request to Join" on a driver Ride, driver gets an alert, driver taps Accept, chat opens. A chat thread is created only upon acceptance and is bound to that `ride_id`. Requests cannot start chats. One pending offer/join per (ride, passenger); declined ones cannot be resent for that ride. No "Request to Join" when available seats = 0.
4. On acceptance, atomically decrement ride `availableSeats` by the request's passenger count (bike/single = 1) with a conditional atomic update so seats never go below 0. If either party cancels after accept, restore the seats, delete that chat, notify the other party.
5. Only the passenger or acceptor action changes match state; viewing or messaging never marks a request Matched.
6. Privacy: strict mutual masking. Nobody sees another user's phone/WhatsApp/email in API responses, user objects, logs or client state. A user sees only their own number on their own Profile/settings, fetched separately. The existing WhatsApp field on the driver ride form is retained so the driver can edit their own number, but it is never returned to anyone else (done in P4, not P0). Phone is still collected at registration. Passenger and driver communicate only via in-app chat.
7. Chat is stored as plain text (no E2EE). Admins can query active chats via DB/admin panel. Regular users see only their own conversations, enforced in the backend; non-participants get 404.
8. Expiry: ride lifetime ends at departure + 15 minutes (fixed). COMPLETED is derived at runtime, never stored. At that threshold the ride and its conversations/messages are hard-deleted. Every chat endpoint does a read-time check (departure+15min <= now => deny and hard-delete chat). Vercel free daily cron `0 0 * * *` (05:00 PKT) sweeps lingering data. No paid services, external pingers or GitHub Actions.
9. Reports: "Report Abusive Message" only in V1; no blocking (deferred post-V1). A snapshot (message text, sender id, timestamp, ride context) is stored in a `reported_flags` collection and hard-deleted after 15 days by the daily cleanup job (TTL index as well).
10. Scheduling: Option B (one document per date, grouped by `seriesId`). Window today to today+13 days; max 6 dates per submission; idempotent via client-generated `clientRequestId`. Active future cap: 7 per user, symmetric for drivers and passengers, counted per scheduled date (earlier mentions of 12 are superseded; keep as a single constant).
11. Vehicle: Bike or Car only; no "Any" for requests. Bike forces 1 seat on frontend and backend. Missing `vehicleType` on old rides = CAR, no data migration.
12. Requests: drivers see all passenger requests. Expired/unaccepted requests stay visible to the passenger for 24 hours with an "Expired" badge, then are deleted by TTL plus daily cleanup.
13. Push: Web Push with the free `web-push` package + VAPID keys (user generates keys and sets Vercel env vars; values are never read or printed). Best-effort on Android; iOS needs Home Screen install. Payloads are generic only ("New message received" / "New ride request"), with no message text or sender identity. In-app unread badge is the primary fallback.
14. Navigation: bottom nav has exactly 4 items: Home, Active Rides, Chat, Profile. Roads moves (code preserved) to a link inside a new minimal Profile page (name/basic details, logout, Roads link). A "+" floating action button on Home and Active Rides offers "Offer Ride" / "Post Request".
15. Dependencies: do not add `express-rate-limit` or `helmet`; implement rate limiting ourselves (Mongo-backed counters for chat later; simple in-memory limiter for auth in P0, best-effort because counters are per serverless instance). Only new dependency allowed later: `web-push` (pinned).
16. Roadmap order: P0 safety/time zone, P1 vehicle type, P2 multi-day, P3 requests + Offer/Join flow, P4 chat + push + reports + WhatsApp masking + cron, P5 matching/filters, P6 nav/profile/polish. One phase at a time, with user review between phases.

Superseded earlier text (see the matching sections, each carries a pointer here): chat context is ride-only (sections 3.2, 7.1, 7.2); passenger "Mark as matched" and manual seat flow (4.1, 4.2, 4.3) are replaced by decisions 3 to 5; cron schedule `0 3 * * *` becomes `0 0 * * *`; cap of 12 becomes 7; `ANY` vehicle preference removed; report TTL 30 days becomes 15 days; BottomNav changes per decision 14.

---

## 0. Summary (read this first)

> Note: this summary predates the approved decisions. See FINAL DECISIONS above where they differ.

1. The app is a clean, small, driver-only MVP: 3 Mongoose models (`User`, `Ride`, `RoadStatus`), 3 route groups (`/api/auth`, `/api/rides`, `/api/road-status`), a Vite React PWA. It is easy to extend. We do not need to rebuild anything.
2. The backend runs as a Vercel serverless function (`backend\vercel.json` uses `@vercel/node` on `server.js`). That means: no persistent WebSockets, no in-process timers, and in-memory rate limiting is weak. Recommendation: short polling for chat, MongoDB TTL plus "lazy purge" plus one daily Vercel Cron for cleanup.
3. Today's app leaks the driver's WhatsApp number to every logged-in user (`rideController.getRideById`). This directly conflicts with your chat privacy rules. It must be removed once chat exists.
4. There are existing bugs that matter for the new features:
   - Time zone bug: departure times are parsed in the server's time zone (UTC on Vercel), so rides in Pakistan time are stored 5 hours late.
   - `GET /api/rides?date[$ne]=x` style query injection and unescaped regex in `keyword`.
   - `updateSeats` can set seats above `totalSeats`.
   - `getRideById` returns expired or full rides.
5. Recommended scheduling model: **Option B, one document per date (instance), grouped by a `seriesId`**. It keeps every existing rule (search, expiry, TTL, seats, chat purge) working per date with no new logic. "A Monday ride never appears on Tuesday" is true by construction. Cancelling one date touches only that document.
6. Recommended phases (small, each deployable): P0 safety fixes, P1 vehicle type, P2 multi-day, P3 passenger requests, P4 chat, P5 matching and filters, P6 trust and polish.
7. Open questions are in section 10. The ones that block design most: time zone of users, whether to remove WhatsApp immediately, whether chat can attach to a request (before any ride exists), and what counts as "completed" for purging.

---

## 1. What exists today (evidence)

### 1.1 Backend files (all inspected)

| File | What it does |
|---|---|
| `backend\server.js` | Express app. CORS allows localhost, LAN, any `*.vercel.app`, and `CLIENT_URL`. `express.json()`. Calls `connectDB()` before every request. Mounts `/api/auth`, `/api/rides`, `/api/road-status`. Health at `/api/health`. Central error handler returns `err.message`. Listens on a port only when not on Vercel and not in test. Exports `app` for Vercel. |
| `backend\vercel.json` | `@vercel/node` build of `server.js`, route `/(.*)` to `server.js`. No `crons`. |
| `backend\config\db.js` | Cached mongoose connection (`isConnected` flag + `readyState`). Optional `DNS_SERVERS` local override. |
| `backend\middleware\authMiddleware.js` | `protect` (Bearer JWT, loads `User` without password on every request), `optionalAuth`, `adminOnly` (role `admin` or `ADMIN_EMAIL` match). |
| `backend\models\User.js` | `name`, `email` (unique), `password` (select:false, bcrypt), `phone` (default ''), `role` (user/admin), timestamps. |
| `backend\models\Ride.js` | See 1.2. |
| `backend\models\RoadStatus.js` | Admin road updates. Unrelated to this work. |
| `backend\controllers\authController.js` | register, login, getMe. Returns `id, name, email, phone, role` to the user themselves. JWT 30 days (`utils\generateToken.js`). |
| `backend\controllers\rideController.js` | createRide, getRides, getRideById, getMyRides, updateSeats, deleteRide. |
| `backend\utils\dateHelpers.js` | `createDepartureDateTime`, `isFutureDeparture` (5 min), `calculateExpiration` (+15 min). |
| `backend\utils\phoneSanitizer.js` | Turns `0310-5517386` into `923105517386`; valid if 10 to 15 digits. |
| `backend\tests\api.test.js` | Jest + supertest + mongodb-memory-server. Groups: auth, feed and guest phone masking, TTL, road status. `npm test` = `jest --runInBand`. |
| Deps (`backend\package.json`) | express 4, mongoose 8, jsonwebtoken, bcryptjs, cors, dotenv. No helmet, no rate limiter, no validator. |
| Env key names (`backend\.env`, values not read) | `MONGO_URI`, `JWT_SECRET`, `PORT`, `CLIENT_URL`, `ADMIN_EMAIL`, `DNS_SERVERS`. |

### 1.2 Ride model, indexes, expiry

Fields: `driver` (ref, indexed), `pickupLocation`, `destination` (max 100), `rideDate` (string `YYYY-MM-DD`), `departureTime` (string `HH:mm`), `departureDateTime` (Date, indexed), `availableSeats` (0..6), `totalSeats` (1..6), `pricePerSeat`, `whatsappNumber` (required), `genderPreference`, `carDetails` (max 80), `notes` (max 300), `status` (`ACTIVE|FULL|CANCELLED`, indexed), `expiresAt` (required), timestamps.

Indexes: `driver`, `departureDateTime`, `status`, TTL `{expiresAt:1}` with `expireAfterSeconds:0`, compound `{rideDate, status, departureDateTime}`.

Expiry behaviour today:
- `expiresAt = departure + 15 minutes`. MongoDB's TTL monitor deletes the document some time after (it runs about once a minute, not exactly on time).
- `getRides` does NOT rely on TTL. It filters `status:'ACTIVE'`, `departureDateTime > now - 15min`, `availableSeats > 0`. Good pattern. We keep it.
- `getRideById` does NOT filter on status or time. A full or just-expired ride is still returned until TTL removes it.
- `CANCELLED` exists in the enum but nothing sets it. `deleteRide` hard deletes (`findByIdAndDelete`).
- Atlas Free cluster: TTL indexes are supported. Storage is a hard cap of 512 MB on a Free cluster (Atlas docs, "FAQ: Storage"). Free clusters also throttle at about 100 operations per second (MongoDB community post quoting the docs) and allow up to 500 connections. I could not open the current Atlas page for these numbers, so please re-check before sizing.

### 1.3 Endpoints today

| Method and path | Auth | Notes |
|---|---|---|
| POST `/api/auth/register`, POST `/api/auth/login`, GET `/api/auth/me` | none, none, protect | returns own email/phone |
| GET `/api/rides?date=&keyword=` | optionalAuth | list; hides phone |
| GET `/api/rides/my-rides` | protect | |
| GET `/api/rides/:id` | optionalAuth | returns `whatsappNumber` and `whatsappLink` for ANY logged-in user |
| POST `/api/rides` | protect | |
| PATCH `/api/rides/:id/seats` | protect, owner | |
| DELETE `/api/rides/:id` | protect, owner | hard delete |
| GET/POST/PUT/DELETE `/api/road-status` | public GET, admin writes | |
| GET `/api/health` | none | |

### 1.4 Frontend (all in `frontend\src`)

- Router (`App.jsx`): `/` Feed, `/rides/:id` RideDetails, `/road-status`, `/login`, `/register`, protected `/offer-ride` (OfferRide) and `/my-rides` (MyRides). `ProtectedRoute` wraps the protected ones.
- `components\BottomNav.jsx`: mobile bottom bar with Browse, Roads, Offer, My Rides or Login (4 to 5 slots already; it is full).
- `services\api.js`: axios; base URL from `VITE_API_URL` else `http://<host>:5000/api`; attaches `carpool_token` from localStorage; drops the token on 401. The comment mentions Render, but `backend\vercel.json` suggests Vercel. See open question 2.
- `context\AuthContext.jsx`: keeps the full `user` object (id, name, email, phone, role) in React state; token in localStorage (`carpool_token`).
- `pages\Feed.jsx`: tabs Today / Tomorrow / custom date input; calls `GET /rides?date=`; keyword search runs in the browser; `utils\nlpSearchParser.js` parses words like "kal", "aaj", "parso" into a date tab.
- `pages\OfferRide.jsx`: form, prefilled WhatsApp from `user.phone`, WhatsApp required. `pages\MyRides.jsx`: seat +/- and delete (tooltip says "someone confirmed on WhatsApp"). `pages\RideDetails.jsx`: shows WhatsApp button and a disclaimer that a listing does not guarantee a seat (good, reuse it). `components\RideCard.jsx`: shows seats left and `carDetails`.
- `vite.config.js` (PWA): API calls are `NetworkOnly`, never cached. Good for chat: no stale or cached private messages in the service worker.
- No `dangerouslySetInnerHTML` anywhere in `src\**\*.jsx` (checked by search). React's default escaping is therefore our XSS baseline.

### 1.5 Findings and risks in current code

| # | Severity | Finding | Where |
|---|---|---|---|
| F1 | High (privacy) | Any logged-in user gets the driver's `whatsappNumber` and a `wa.me` link. The test at `tests\api.test.js` ~line 222 asserts this as intended behaviour. | `rideController.getRideById`; `RideDetails.jsx`; tests |
| F2 | High (correctness) | Time zone. `new Date('YYYY-MM-DDTHH:mm:00')` has no offset, so it uses the server's local zone. Vercel runs in UTC. For a user in Pakistan (UTC+5) a 08:30 ride is stored as 08:30 UTC (13:30 PKT). Result: rides stay visible 5 hours after departure, and "must be in the future" lets users post times up to about 5 hours in the past. Local dev on a PKT machine hides it. I did not run it on production, so please confirm by comparing one stored `departureDateTime` with what was entered. | `utils\dateHelpers.js` |
| F3 | High (security) | `query.rideDate = date` uses `req.query.date` unchecked. Express parses `?date[$ne]=x` into an object, so this is a likely NoSQL operator injection. `keyword` goes into `$regex` unescaped (regex injection and slow-pattern risk). Not executed by me. | `rideController.getRides` |
| F4 | Medium | `updateSeats` accepts 0..6 regardless of `totalSeats` and ride expiry, and can flip a FULL ride back to ACTIVE. Needed fix for bike (max 1). | `rideController.updateSeats` |
| F5 | Medium | `getRideById` returns expired or full rides and has no status filter. | `rideController.getRideById` |
| F6 | Medium | No rate limiting anywhere (login, register, ride create). No `helmet`. | `server.js` |
| F7 | Low | Error handler and DB error response return raw `err.message` / `details`. | `server.js` |
| F8 | Low | `AuthContext` keeps email and phone in global state; `/auth/*` returns them. Fine for a user's own data but conflicts with a strict reading of "never in client-side global state". | `AuthContext.jsx`, `authController.js` |
| F9 | Low | CORS accepts every `*.vercel.app` origin. Auth uses a Bearer header (not cookies), so risk is small, but tighten to your own domains if possible. | `server.js` |
| F10 | Info | JWT lasts 30 days and is stored in localStorage. Chat is the first user-to-user text on the site, so XSS matters more now. Keep React escaping, no HTML rendering of messages. | `generateToken.js`, `api.js` |
| F11 | Info | Existing data: every existing Ride has no `vehicleType`, no `seriesId`. Rides are short-lived (deleted after departure +15 min), so old data disappears on its own within days. | |

---

## 2. Deployment reality and what it means

- Backend is serverless. Vercel's own guide says serverless functions do not hold WebSocket connections (https://vercel.com/guides/do-vercel-serverless-functions-support-websocket-connections). So Option B (WebSockets/Socket.io) would force a second host (Render/Railway free tier that sleeps, or a paid realtime service). That breaks "zero budget, minimal change".
- Vercel Cron: Hobby accounts can only run a cron job once per day; hourly or faster expressions fail the deployment (https://examples.vercel.com/docs/cron-jobs/usage-and-pricing). Per-project cron limit is now 100 on all plans (changelog, https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan). Conclusion: one daily cleanup sweep is possible for free; it cannot be our main purge.
- I did not verify current Hobby function-invocation and duration quotas. Check https://vercel.com/docs/platform/limits before launch. Do not promise "unlimited".
- Atlas Free (M0): 512 MB hard storage cap, throttled around 100 ops/second, up to 500 connections. A serverless function that reconnects on cold start should reuse the cached connection (already done in `db.js`).
- PWA: API is `NetworkOnly` (good for privacy). Web Push is technically possible for installed PWAs (free, but needs a VAPID key, a subscription collection, and iOS requires the app to be added to the Home Screen). It is out of V1.

---

## 3. Module analysis

### 3.1 Module 1: Passenger requests
- Needs a new collection (`RideRequest`). Do not reuse `Ride`: the fields, statuses and ownership differ (passenger count, no price, no seats left).
- Same date handling as rides: one document per travel date (see section 5).
- "Matched" must be an explicit, human action. Viewing a request or sending a message changes nothing about status.
- Statuses: `ACTIVE`, `MATCHED`, `CANCELLED` stored; `EXPIRED` is derived from `expiresAt < now` at read time (so it is correct even before TTL runs).

### 3.2 Module 2: Chat
> Superseded in part: chat is ride-only, created only after mutual acceptance. See Final Decisions 3 to 5.
- All backend rules in your spec are doable on the current stack with polling. The main design risks are (a) orphaned chats when a Ride is removed by TTL (Mongo TTL does not trigger app code), (b) rate limiting on serverless, (c) report evidence vs "delete everything".
- Participant checks must be a single reusable function used by every chat route.

### 3.3 Module 3: Bike and Car
- Add `vehicleType` to `Ride` with default `CAR`. Bike forces `totalSeats = availableSeats = 1`.
- Mongoose defaults are not applied to old documents read with `.lean()` (which `getRides` uses), and `{vehicleType:'CAR'}` queries do not match old documents that lack the field. So: treat missing as CAR in both mapping (`ride.vehicleType ?? 'CAR'`) and queries (`{ vehicleType: { $ne: 'BIKE' } }` for "car"). No migration needed.

### 3.4 Module 4: Multi-day (see section 5 for the comparison)

### 3.5 Module 5: Matching (see section 6)

---

## 4. Workflows
> Superseded in part: the Offer/Join + Accept flow, atomic seat decrement and matching rules are in Final Decisions 3 to 5. WhatsApp handling follows Final Decision 6.

### 4.1 Driver workflow
1. Offer ride: pick Car or Bike, pickup, destination, time, choose 1 to 6 dates (checkbox chips for the next days), seats (Car only), price, notes. No WhatsApp field.
2. App creates one ride per selected date (a series). Shown in "My Rides" grouped by series, each date with its own seat controls and Cancel button.
3. "Requests" tab: list of passenger requests that match the driver's rides (or browse all). Each card has a "Respond" button.
4. Respond opens a chat with the passenger (optionally linked to one of the driver's matching rides). Nothing changes on the request.
5. Seats: the driver reduces seats by hand after agreeing (same as today's MyRides behaviour). No automatic booking in V1.
6. After departure +15 min the ride and its chat are deleted.

### 4.2 Passenger workflow
1. Post request: pickup, destination, time, 1 to 6 dates, vehicle preference (Bike/Car), passengers (Bike = 1, Car = 1..6), optional notes.
2. "My Requests": each date has status Active / Matched / Cancelled / Expired and a "Possible matches (n)" count.
3. Tap a match to see the ride (labelled Exact / Close / Alternative with the reasons) and "Message driver".
4. Passenger can also chat from any ride in the normal feed.
5. When the passenger agrees a ride with a driver, the passenger taps "Mark as matched". The driver cannot set it, and messages do not set it.
6. Edit or cancel per date at any time before departure. Cancelling purges that date's chats.

### 4.3 Status transitions

| Entity | From | To | Trigger |
|---|---|---|---|
| Request date | ACTIVE | MATCHED | passenger taps "Mark as matched" (optionally selects the conversation or driver) |
| Request date | MATCHED | ACTIVE | passenger taps "Reopen" |
| Request date | ACTIVE or MATCHED | CANCELLED | passenger cancels (then chat purge) |
| Request date | any | EXPIRED (derived) | `now > expiresAt` (departure + grace) |
| Ride date | ACTIVE | FULL | seats reach 0 (existing) |
| Ride date | FULL | ACTIVE | driver adds a seat, only up to `totalSeats` |
| Ride date | any | deleted | driver cancels (existing hard delete, now with chat cascade) |
| Ride date | any | expired | `now > expiresAt`, then TTL removes it |

Decision (simple English): only the passenger can mark a request Matched, because the passenger is the person who knows if they really got a ride. This avoids false "matched" states caused by a driver just messaging.

---

## 5. Scheduling: Option A vs Option B

Option A: one record that is "available for a period" (e.g. Mon to Sat) with a start date and end date.
Option B: one record per selected date, linked by a `seriesId`.

| Topic | Option A (continuous period) | Option B (instance per date) |
|---|---|---|
| Fits existing search (`rideDate` exact match, Today/Tomorrow/custom) | Needs a range query and date-by-date logic | Works unchanged |
| "Monday ride must not appear Tuesday unless confirmed" | Must be added with exceptions logic | True by construction |
| Cancel one day only | Needs an exceptions list; easy to get wrong | Delete or cancel that one document |
| Seats per day | One counter shared across days (wrong: Monday booking reduces Tuesday) | Each date has its own seats |
| Expiry and TTL | One `expiresAt` for the whole period; the ride could stay visible for days; no per-day TTL | Each date has its own `expiresAt`; TTL and existing expiry logic work as is |
| Chat purge ("ride_id" lifecycle) | A chat would live for the whole period (privacy cost) or needs per-day logic | Chat attaches to one date and is purged at that date's expiry |
| Number of documents | Fewer (1) | Up to 6 per submit (tiny cost on 512 MB) |
| Indexes and queries | Need new range indexes | Existing compound index `{rideDate,status,departureDateTime}` is enough |
| Double-submit protection | One key | One `seriesId` + unique `(driver, seriesId, rideDate)` |
| Complexity | Higher; most bugs | Lower |

Recommendation: **Option B**. Reason: every rule you listed (expiry, search, seats, chat purge, cancel one date) already works per document. Option A would force us to rewrite all of them. The cost is a few extra small documents.

Details of the Option B design (limits: see Final Decision 10: window 14 days, max 6 per submit, cap 7 active future per user):
- Input: `dates: ["2026-05-18","2026-05-19",...]`. Backend validation: array, 1 to 6 items, unique, each `YYYY-MM-DD` and a real calendar date, each not in the past, and all within a window (proposal: today to today+13 days; open question 7). Reject otherwise.
- "Up to six days" is counted per submission. A user can submit again. If you want a cap per user at the same time (anti-spam), add a limit such as 12 active future instances per user (open question 7).
- Idempotency: the client generates a `clientRequestId` (UUID) when the form opens and sends it with Create. The server uses it as `seriesId`. A unique index on `{driver, seriesId, rideDate}` plus `insertMany(..., {ordered:false})` means a double tap, refresh or retry creates nothing new; the server then returns the existing series. The same applies to requests.
- Cancel one date: `DELETE /api/rides/:id` (existing). Cancel the whole series: `DELETE /api/rides/series/:seriesId` (new, owner only). Editing time or seats of one date edits one document.
- Each instance gets its own `departureDateTime` and `expiresAt`. A ride is never shown after `expiresAt` because queries filter on the time themselves; TTL only cleans up.
- Time zone: see section 7.3.

---

## 6. Matching rules (simple, no maps, no paid APIs, no AI)

Matching is computed when someone looks (no stored match documents to keep in sync).

Candidates: same `rideDate`, ride `status = ACTIVE`, not expired, `availableSeats > 0`, driver is not the passenger.

Normalising text: lower case, trim, collapse spaces, remove punctuation, split into words, drop filler words (road, sector, near, chowk, stop, etc.; list is configurable).

| Level | Rules (all must hold) | Label shown |
|---|---|---|
| EXACT | same date; vehicle equals preference (or request says "Any"); `availableSeats >= passengers`; departure within 30 min of requested time; destination matches (normalised equal or one contains the other); pickup matches the same way | "Exact match" |
| CLOSE | same date; vehicle and capacity OK; time within 90 min; destination matches; pickup shares at least one meaningful word | "Close match: pickup or time differs" with the reasons |
| ALTERNATIVE | same date; destination matches; capacity OK; but different vehicle type or time up to 2 hours | "Alternative: car instead of bike" (always names the difference) |

- Bike request: car rides can only appear as ALTERNATIVE, never EXACT.
- Bike ride: only `passengers = 1` requests can match.
- Car ride: `availableSeats` (not `totalSeats`) is compared. Seats are per ride; we do not assume all cars have equal capacity.
- Output includes `matchLevel` and `reasons[]` so the UI explains itself.
- Matching never changes any status.

Future (not in V1): a small curated list of Twin Cities areas/landmarks mapped to zones (pickup autosuggest) so "F-10", "F10 Markaz" and "F-10 Markaz Islamabad" match. A later step could use latitude/longitude from a free source, but free geocoding services have strict usage policies, so check terms first. Not needed now.

---

## 7. Proposed design

### 7.1 Data model (minimal changes)

Changes to `Ride` (all additive, all with defaults, no migration):

| Field | Type | Notes |
|---|---|---|
| `vehicleType` | `'CAR'|'BIKE'`, default `'CAR'` | missing means CAR |
| `seriesId` | String, indexed | groups the dates of one submit |
| `whatsappNumber` | change `required` to optional | new rides do not collect it; old rides keep theirs but never send it out |

New indexes: unique partial `{driver:1, seriesId:1, rideDate:1}` (only where `seriesId` exists, so old docs are fine); `{status:1, vehicleType:1, rideDate:1, departureDateTime:1}` for filtered search.

Validation (schema and controller): `BIKE` forces `totalSeats = 1`, `availableSeats` is 0 or 1. `CAR` keeps 1..6. `availableSeats <= totalSeats` always (fixes F4).

New collection `RideRequest`:

| Field | Notes |
|---|---|
| `passenger` ref User (indexed) | |
| `pickupLocation`, `destination` | max 100 each |
| `requestDate` | `YYYY-MM-DD` (one doc per date) |
| `departureTime` | `HH:mm` |
| `departureDateTime`, `expiresAt` | same helper as rides |
| `vehiclePreference` | `'BIKE'|'CAR'|'ANY'` (ANY optional, open question 8) |
| `passengerCount` | BIKE = 1; CAR 1..6 |
| `notes` | max 300 |
| `status` | `ACTIVE|MATCHED|CANCELLED` |
| `matchedRide` | optional ref, set by passenger |
| `seriesId` | grouping and idempotency |
| `purgeAt` | `expiresAt + 24h`; TTL index so passengers can still see "Expired" for a day |

Indexes: `{requestDate,status,departureDateTime}`, `{passenger,departureDateTime}`, unique partial `{passenger,seriesId,requestDate}`, TTL on `purgeAt`.

New collection `Conversation`:

| Field | Notes |
|---|---|
| `contextType` | `'ride'` or `'request'` (see open question 3) |
| `contextId` | ride id or request id |
| `driver`, `passenger` | User refs; these two are the only participants |
| `rideId` | optional ride reference when the context is a request |
| `contextSummary` | pickup, destination, date, time (copied, so the header needs no join) |
| `lastMessageAt`, `lastMessagePreview` | for the list view |
| `unread` | `{driver: n, passenger: n}` counters |
| `expiresAt` | copied from the ride or request |
| `status` | `OPEN` (closed chats are deleted, not kept) |

Indexes: unique `{contextType, contextId, driver, passenger}` (starting a chat twice returns the same one); `{driver,lastMessageAt}`, `{passenger,lastMessageAt}`; TTL on `expiresAt`.

New collection `Message`:

| Field | Notes |
|---|---|
| `conversation` | ref |
| `sender` | User ref |
| `body` | string 1..500 chars, plain text |
| `clientMessageId` | UUID from client, unique with conversation (prevents double send) |
| `createdAt`, `readAt` | timestamps |
| `expiresAt` | copy of conversation `expiresAt` so TTL needs no join |

Indexes: `{conversation:1, createdAt:1}`, unique `{conversation, clientMessageId}`, `{sender, createdAt}` (rate limit), TTL on `expiresAt`.

New collection `Report` (simplified, V1): `reporter`, `reportedUser`, `conversationId`, `messageId`, `snapshot` (the reported text only, max 500), `reason` enum, `createdAt`, TTL (30 days). Admin list endpoint uses the existing `adminOnly`. See open question 6 about keeping a snapshot.

Backward compatibility: no field is renamed or removed. Old rides keep working, default to Car, and expire normally.

### 7.2 API endpoints

Add or change (all `protect` unless noted):

Rides:
- `POST /api/rides` (update): accept `vehicleType`, `dates[]`, `clientRequestId`; `whatsappNumber` no longer required/stored for new rides. Response lists the created instances.
- `GET /api/rides` (update, optionalAuth): validated query: `date`, `vehicleType`, `timeFrom`, `timeTo`, `minSeats`, `pickup`, `destination`, `keyword` (regex-escaped, strings only, max length). Adds `vehicleType` to each item.
- `GET /api/rides/:id` (update): remove `whatsappNumber` and `whatsappLink`; return 404 for expired; keep FULL visible to the owner only.
- `PATCH /api/rides/:id/seats` (update): `0 <= seats <= totalSeats`; BIKE max 1; reject if expired.
- `DELETE /api/rides/:id` (update): delete conversations and messages for this ride first (event-driven purge).
- `DELETE /api/rides/series/:seriesId` (new): owner only, same purge.

Requests:
- `POST /api/requests` (create 1 to 6 dates, idempotent), `GET /api/requests/mine`, `GET /api/requests` (drivers browse; filters date, vehicle, time range, keyword; shows no contact data), `GET /api/requests/:id`, `PATCH /api/requests/:id` (owner edit), `DELETE /api/requests/:id` (owner cancel and purge), `DELETE /api/requests/series/:seriesId`, `POST /api/requests/:id/match` (owner: mark Matched), `POST /api/requests/:id/reopen`, `GET /api/requests/:id/matches` (rides with `matchLevel`, `reasons`), `GET /api/rides/:id/matching-requests` (owner driver).

Chat (`/api/chat`): every route first runs `loadConversationForUser(id, req.user._id)`; a non-participant gets 404 (not 403) so ids cannot be probed. Closed or expired conversation returns 410 and deletes it.
- `POST /api/chat/conversations` `{contextType, contextId, firstMessage, clientMessageId}`: creates or returns the existing one. Rules: caller cannot chat with self; ride/request must be active and not expired; driver of a ride or owner of a request is the other participant.
- `GET /api/chat/conversations`: list with counterpart name, context summary, last message, unread count.
- `GET /api/chat/conversations/:id/messages?after=<iso or id>`: returns only messages newer than the cursor; marks the caller's received messages read.
- `POST /api/chat/conversations/:id/messages` `{body, clientMessageId}`: validated, sanitised, rate limited; idempotent on `clientMessageId`.
- `GET /api/chat/unread-count`: one tiny counter for the nav badge.
- `POST /api/chat/messages/:id/report` `{reason}`.
- `GET /api/admin/reports` (adminOnly).
- `GET /api/cron/purge` secured by `CRON_SECRET` header (see 7.4).

Response whitelisting: every chat controller builds output field by field (as `getRides` already does). Never `populate('user')` and pass through. Counterpart is `{ name }` only plus a role label ("Driver" or "Passenger"). No email, no phone, no WhatsApp.

### 7.3 Time zone (fix first)
> Final: see Final Decision 1 (migration script, dry-run by default, is part of P0).
Add a single constant (e.g. `APP_TIME_ZONE` = `Asia/Karachi`, which has no daylight saving) and build dates with an explicit offset: `new Date(\`${date}T${time}:00+05:00\`)`. Compute "today" for validation in the same zone on the server, not from the server's local date. Frontend `utils\dateUtils.js` uses the device's local date for Today/Tomorrow; this is fine for users in Pakistan. Existing live rides were stored 5 hours late; since they self-delete within days, the simplest path is to deploy the fix and accept a short overlap. If you prefer, a one-off script can subtract 5 hours from the existing `departureDateTime`/`expiresAt` (open question 1).

### 7.4 Chat purge plan (four layers, none relies on a single mechanism)
> Final: cron is `0 0 * * *` and expiry is hard delete at departure + 15 min (Final Decision 8). Report snapshots follow Decision 9.

1. Event-driven (primary): ride delete, series delete, request cancel and request delete all call one helper `purgeConversations({contextType, contextIds})` which runs `Message.deleteMany` and `Conversation.deleteMany`. Also called after a driver sets a ride to cancelled.
2. Own TTL indexes: `Conversation.expiresAt` and `Message.expiresAt` are copies of the ride/request `expiresAt`. This covers the case where TTL removes the Ride itself (which fires no code).
3. Lazy purge: chat endpoints reject any conversation where `now >= expiresAt` (410) and delete it on the spot. So access closes at the exact moment, even if the 60-second TTL monitor is late.
4. Daily safety sweep: Vercel Cron (Hobby: once per day) calls `/api/cron/purge`, which deletes conversations whose ride/request no longer exists or is expired. Add to `backend\vercel.json`: `"crons":[{"path":"/api/cron/purge","schedule":"0 3 * * *"}]`. Vercel sends the secret as a Bearer header; the route compares it with `CRON_SECRET`. Exact header and settings should be confirmed in the Vercel Cron docs when implementing.

When a ride is FULL the chat stays open until departure (people may still arrange pickup). When a request is MATCHED, its chats also stay until expiry.

### 7.5 Polling vs WebSockets

| | Short polling (Option A) | WebSockets / Socket.io (Option B) |
|---|---|---|
| Works on Vercel serverless | Yes | No (needs a separate always-on server) |
| Extra cost | None | A second host; free tiers sleep or have limits |
| Code change | Small, plain HTTP, reuses `protect` | New server, new auth on socket, new deploy path |
| Latency | 3 to 5 s | Instant |
| Load | More requests | Fewer requests |

Recommendation: **short polling**, with these controls to keep load low:
- 4 s interval only while the chat screen is open AND the tab is visible (pause on `visibilitychange`).
- Request only new messages (`after` cursor); server answers with an empty list in a single indexed query when nothing is new.
- Back off to 10 to 15 s after 2 minutes without activity; return to 4 s after a send.
- Unread badge: one `GET /api/chat/unread-count` every 30 to 60 s while the app is visible and logged in; none in the background.
- Optimisation to consider later: `protect` currently loads the full user from Mongo on each call; a lighter check (JWT plus `_id`) would cut one query per poll.

Rough load: each poll is about 2 to 3 database operations. 20 people chatting at once at 4 s is about 15 operations per second, well under the Free cluster's ~100 ops/s throttle. At about 100+ simultaneous chatters it would not fit and we would need to move chat off the Free cluster or slow polling. This is an estimate, not a measurement. Vercel Hobby invocation quotas need to be checked (see section 2).

### 7.6 Security and privacy for chat
- Auth: every chat route uses `protect`. Participant check on every route (list, read, send, report). Admin report list uses `adminOnly`.
- Body rules: must be a string; trim; 1 to 500 characters; strip control characters; no HTML is ever rendered (React text nodes); store as plain text. Context fields (`contextType`) are validated against an enum; ids validated as ObjectIds. Reject any object-typed field to block operator injection (`$ne`). Same strict-type approach for rides and requests (fixes F3).
- Rate limit: serverless instances do not share memory, so an in-memory limiter is only a partial guard. Use the database: before insert, count the sender's messages in the last 60 s using `{sender, createdAt}` (limit e.g. 20/min and 1 per second), cap each conversation at e.g. 300 messages, limit new conversations a user can start per hour (e.g. 10). Add `express-rate-limit` (in-memory) as a best-effort extra on login/register and chat. Return 429.
- No leakage: never include email, phone, WhatsApp, user ids of counterparts beyond what is needed, or the `User` document in any payload. Add a Jest test that creates users with known phone/email and asserts none of those strings appear in any chat response (use JSON string search).
- Client state: the chat context stores only conversation and message objects as returned. Do not log message bodies to the console.
- Disclaimers shown in the chat header and on request/ride pages: chat does not guarantee a seat; do not share personal numbers; meet in public places. No "verified" badges or claims, since we do not verify identity.
- Existing leak (F1): remove WhatsApp from `getRideById`, `RideDetails.jsx`, `OfferRide.jsx` and update the test around line 222 of `tests\api.test.js`.
- Auth payload (F8): decide in open question 4.

### 7.7 Frontend changes
> Navigation is final per Decision 14 (4 items: Home, Active Rides, Chat, Profile; Roads under Profile; "+" FAB).

Navigation: `BottomNav.jsx` is full. Proposed bar: Browse | Requests | (+) Post | Messages (with unread badge) | Account/My. "Roads" moves to the top Navbar menu. `Post` opens a small chooser: "Offer a ride" or "Request a ride".

New pages (`frontend\src\pages`): `RequestRide.jsx` (form), `MyRequests.jsx`, `RequestDetails.jsx` (matches with labels), `Requests.jsx` (drivers browse), `Messages.jsx` (list), `Chat.jsx` (conversation).
New components: `VehicleBadge`, `DateChips` (select up to 6 dates, shared by both forms), `RequestCard`, `StatusBadge`, `MatchBadge`, `ChatBubble` (states Sending / Sent / Failed with retry), `UnreadBadge`, `SafetyNotice`, `ReportDialog`.
New hooks/services: `usePolling` (visibility and back-off), `services\chat.js`, `services\requests.js`.
Changed: `OfferRide.jsx` (vehicle toggle; Bike hides the seats input and fixes it at 1; multi-date chips; no WhatsApp field), `MyRides.jsx` (group by series; per-date cancel), `RideCard.jsx` and `RideDetails.jsx` (vehicle badge; "Message driver" instead of WhatsApp), `Feed.jsx` (filters: vehicle, time range, minimum seats, pickup/destination, still Today/Tomorrow/custom), `AuthContext.jsx` (see F8), `App.jsx` (routes).

Mobile first: single-column forms, large tap targets, the date chips as the only multi-day control.

### 7.8 Cost and deployment implications
- No new paid service. Atlas Free: new collections are small (messages are max 500 chars and are deleted after the ride). Watch the 512 MB cap and ~100 ops/s throttle.
- Vercel Hobby: polling raises the function call count. Chat polling is the main driver. Check the current quota page before launch and keep the polling controls above.
- One new env var: `CRON_SECRET`. One optional: `APP_TIME_ZONE`.
- New dependencies, each small and pinned when added: `express-rate-limit` (optional best effort), `helmet` (optional). No Socket.io, no push service.

### 7.9 Notifications (realistic)
- V1: in-app only: unread badge on Messages, a "New response" count on "My Requests" (via the same unread endpoint returning both counts), refreshed by the 30 to 60 s visible-tab poll. No promise of notifications when the app is closed.
- Later (optional): Web Push for installed PWAs. Free, but needs a push-subscription collection, VAPID keys, and sending from a serverless function. iOS only works after Add to Home Screen. Treat as a stretch phase, not a guarantee.

### 7.10 Other improvements ranked for V1

| Rank | Item | Why |
|---|---|---|
| 1 | Time zone fix, input validation, `getRideById` expiry check (P0) | Prevents wrong data and injection |
| 2 | Remove WhatsApp exposure | Required by your privacy rule |
| 3 | Request status view (per date) | Core of module 1 |
| 4 | Search filters: vehicle, date, time range, pickup/destination, min seats | Needed for matching to be usable |
| 5 | In-app unread badges | Realistic notifications |
| 6 | Report message + admin list | Minimal safety |
| 7 | Request expiry display | "Expired" for 24 h, then gone |
| 8 | Block user | Later (P6); needs a small `Block` collection |
| 9 | Web Push | Stretch |

---

## 8. Risks and compatibility notes

- Removing WhatsApp changes how current users contact drivers. Mitigation: ship chat first, then switch off WhatsApp in the same release (open question 5).
- Time-zone fix changes stored times for new rides only; old rides are inconsistent for a few days (open question 1).
- Passengers and drivers may expect chat to mean "seat booked". Show the disclaimer everywhere and keep seat changes manual.
- The Ride TTL deletes rides silently; chats are protected by their own TTL and lazy purge (7.4).
- Report snapshot vs "delete everything": a retained snapshot is a deliberate exception (open question 6).
- The unique partial index on `{driver, seriesId, rideDate}` must be created with `partialFilterExpression` so existing rides without `seriesId` do not break index creation. Mongoose `autoIndex` builds it on first start; on Atlas Free this is fine for small data.
- Polling load risk on Free tiers (see 7.5). Monitor after launch.
- Existing test `tests\api.test.js` ~line 222 must change with the WhatsApp removal. New tests are needed for each phase.
- Express 4 `req.query` objects: keep strict string checks on every query field.

---

## 9. Phased roadmap (small phases, each can be released alone)

| Phase | Scope | Main files | Verify |
|---|---|---|---|
| P0 Safety and correctness (DONE; follow-ups F-1 migration `--before` cutoff + `timeShiftedAt` stamp at creation, F-3 `x-forwarded-for` trusted only on Vercel: resolved in P1) | Time-zone fix in `dateHelpers.js`; validate `date` (regex, string), escape `keyword`; `getRideById` 404 for expired; `updateSeats` cap to `totalSeats`; basic rate limit on login/register; stop returning raw DB error details | `utils\dateHelpers.js`, `rideController.js`, `server.js`, tests | `npm test`; manual: create a ride in local time and check the stored UTC value |
| P1 Vehicle type (DONE, see p1-verification.md) | `vehicleType` field; bike forces 1 seat (frontend and backend); badge on cards/details; filter in feed | `models\Ride.js`, `rideController.js`, `OfferRide.jsx`, `RideCard.jsx`, `RideDetails.jsx`, `Feed.jsx` | tests: old docs without field read as CAR and match the car filter; bike seats > 1 rejected |
| P2 Multi-day (rides) (DONE; see "P2 deploy notes" below) | `dates[]` (max 6), `seriesId`, idempotency, series delete, grouped My Rides, `DateChips` component | `Ride.js`, `rideController.js`, `rideRoutes.js`, `OfferRide.jsx`, `MyRides.jsx` | tests: 7 dates rejected; duplicate submit creates nothing new; cancel one date leaves the others |
| P3 Passenger requests | `RideRequest` model/controller/routes, forms, My Requests, driver browse list, statuses, passenger "Mark matched" | new backend files; `RequestRide.jsx`, `MyRequests.jsx`, `Requests.jsx` | tests for transitions; contact does not change status |
| P4 Chat V1 (DONE, incl. Passenger/Driver Mode Switcher, 4-item bottom nav, Profile page, chat UI, push in service worker; see "DEPLOY STEPS (P4)") | Models, routes, participant guard, polling hook, list, thread, unread badge, report, purge (all 4 layers), remove WhatsApp, `vercel.json` cron | `Conversation.js`, `Message.js`, `Report.js`, `chatController.js`, `Messages.jsx`, `Chat.jsx`, `BottomNav.jsx` | tests: non-participant gets 404 on all routes; no phone/email in any payload; purge on delete; 429 on spam |
| P5 Matching and filters | Matching helper, `/matches` endpoints, labels, request-browse filters | `utils\matching.js`, controllers, `RequestDetails.jsx` | unit tests of the rules table in section 6 |
| P6 Trust and polish (REDUCED: nav, Profile and Web Push are done in P4) | Remaining polish only: real-device push testing (Android, iOS Home Screen), accessibility audit with assistive technologies, copy review, block user, admin report view | various | manual and tests |

Suggested order is the table order. P1 and P2 are independent of P3. P4 needs P1 to P3 only for the "request" context.

### P2 deploy notes

Status: P1 DONE, P2 DONE.

- New env vars: none.
- New index: unique partial index `uniq_driver_series_date` on `{ driver: 1, seriesId: 1, rideDate: 1 }` (only for docs where `seriesId` is a string; legacy rides are exempt). Defined in `backend\models\Ride.js`.
- autoIndex check: `backend\config\db.js` calls `mongoose.connect(process.env.MONGO_URI)` with no options, and no `autoIndex`/`autoCreate`/`syncIndexes` setting exists anywhere in `backend\` (`server.js` only uses `NODE_ENV` for error-message exposure and local listen). Mongoose therefore uses its default, `autoIndex: true`, in every environment including production. The index is built automatically the first time the Ride model initializes against the production DB after deploy (first cold start).
- Caveats: (1) the Atlas DB user in `MONGO_URI` must have `createIndex` rights (readWrite on the db is enough). (2) The build would fail only if existing docs already hold duplicate `(driver, seriesId, rideDate)` with a string `seriesId`; none can exist from pre-P2 data because `seriesId` is new. (3) Index build errors are emitted as model `index` events and are not fatal to requests, so check Vercel logs after the first request.
- Optional manual fallback (only if the index is missing, check with `db.rides.getIndexes()` in mongosh):
  `db.rides.createIndex({ driver: 1, seriesId: 1, rideDate: 1 }, { unique: true, partialFilterExpression: { seriesId: { $type: "string" } }, name: "uniq_driver_series_date" })`
- Deploy order: deploy backend, then frontend; hit any ride endpoint once; verify the index in Atlas (Collections > rides > Indexes).

### P3 DONE (passenger requests + offer/join, no chat)

- Collections: `RideRequest` (one doc per date, `seriesId` = clientRequestId, status ACTIVE|MATCHED|CANCELLED stored, EXPIRED derived at read time) and `RideMatch` (ride, request?, passenger, driver, initiatedBy, passengerCount, status PENDING|ACCEPTED|DECLINED|CANCELLED, seen flags, `expiresAt` = ride expiry).
- Endpoints (all `protect`): `POST /api/requests`, `GET /api/requests/mine`, `GET /api/requests` (driver browse + filters), `GET /api/requests/:id`, `GET /api/requests/:id/rides-for-offer`, `PATCH /api/requests/:id`, `DELETE /api/requests/:id`, `DELETE /api/requests/series/:seriesId`; `POST /api/matches`, `GET /api/matches`, `POST /api/matches/:id/accept|decline|cancel|seen`, `GET /api/matches/alerts/count`.
- Indexes: TTL `RideRequest.purgeAt` (expireAfterSeconds 0), TTL `RideMatch.expiresAt`, unique partial `uniq_passenger_series_date`, unique partial `uniq_active_match_ride_passenger` (status PENDING/ACCEPTED), unique partial `uniq_match_client_id`.
- Combined cap: a user's active future Rides plus active future RideRequests (ACTIVE/MATCHED, not expired) share the single cap (`MAX_ACTIVE_FUTURE_ITEMS_PER_USER`, alias of the P2 constant, 7). Helper `utils/activeItemCount.js`; `createRide` now uses it. Best effort under concurrency.
- Accept: claim match PENDING->ACCEPTED, then atomic conditional seat reservation on the Ride (pipeline update, FULL set in the same op), then request MATCHED. If seats fail the match is reverted to PENDING and 409 is returned (acceptor may retry or decline); if the ride is gone/expired the match is CANCELLED. Cancel restores seats (capped at totalSeats, FULL->ACTIVE) and reopens the request. Deleting a ride/request cascades (`utils/matchService.js`).
- Deploy notes: no new env vars; indexes are created by mongoose autoIndex on first connect; the Atlas DB user needs createIndex rights (readWrite is enough).
- P4 hooks: `backend/utils/chatHooks.js` exports `createChatForMatch(match)` (called after ACCEPTED) and `purgeChatForMatch(match)` (called on cancel and cascades); both are no-op stubs for P4 to implement.

---

## 10. Why each major decision (simple English)

1. Keep the current stack (Express, Mongo, React, Vercel). It already works for you. A rewrite would risk production and cost time.
2. Option B (one record per date). Every date behaves like a normal ride, so search, expiry and chat deletion keep working. Option A needs new rules everywhere.
3. Polling, not WebSockets. Vercel serverless cannot keep sockets open. A second server costs money or sleeps. Polling every few seconds only while the chat is open is cheap and good enough for planning a ride.
4. Four-layer purge. A single TTL index is late (about a minute) and does not run code when a Ride disappears. So we delete on events, give chat its own TTL, close access by time on every call, and run a daily sweep as a safety net.
5. Passenger-only "Matched". A driver messaging does not mean a ride is agreed. The passenger knows.
6. Compute matches on demand with plain text rules. No maps or paid services, nothing to keep in sync, and the UI says why a match was suggested.
7. Treat missing `vehicleType` as Car. Old rides keep working with no data migration.
8. Remove WhatsApp from API output. It is the only way to meet "no phone numbers exposed".
9. Return 404 for non-participants. It hides whether a conversation id exists.
10. Fix time zone first. Everything about "expired", "today" and "tomorrow" depends on it.

---

## 11. Open questions (resolved, see Final Decisions)

> All questions below are answered in the FINAL DECISIONS section at the top. The text is kept only as history.

1. Time zone: are all users in Pakistan (Asia/Karachi, UTC+5, no daylight saving)? Should I fix the existing stored times with a one-off script, or let old rides expire naturally?
2. Where is the production API actually hosted: Vercel (as `backend\vercel.json` suggests) or Render (as the `api.js` comment mentions)? This affects cron and limits.
3. Should a chat be allowed to start from a passenger request when the driver has no ride yet (context = request), or must a chat always link to a ride id? I propose "ride or request instance", with the same purge rules.
4. May I stop returning `email` and `phone` from `/auth/login`, `/auth/register`, `/auth/me`, and keep only `id`, `name`, `role` in client state (the profile/phone would not be shown)? Do you still want to collect phone at registration at all?
5. Should WhatsApp be removed immediately when chat ships, or run both for a short transition? (Your privacy rule suggests immediate.)
6. Reports: may we keep a 30-day snapshot of only the reported message text for admin review, even though the chat itself is deleted? Or delete everything and keep only report metadata?
7. Multi-day limits: allowed date window (proposed today to +13 days)? Maximum total future instances per user (proposed 12)? Do dates need to be consecutive, or any 1 to 6 days?
8. Request vehicle preference: allow "Any" in addition to Bike and Car? Can a bike ride take 1 passenger only (assumed yes)?
9. What does "completed" mean? I propose time-based only (departure +15 min, existing grace period) because there is no "Complete ride" button. Do you want a manual "Mark completed/cancel" for drivers?
10. Should drivers see all passenger requests, or only those matching their own rides by default (with a "show all" toggle)?
11. Do you want blocking in V1 or later (P6)? Reporting is included in P4 either way.
12. Is a retention of expired passenger requests for 24 h (to show "Expired") acceptable, or should they disappear at expiry like rides?
13. Do you accept the new bottom navigation layout (Roads moves to the top menu)?
14. Dependencies: OK to add `express-rate-limit` and `helmet` (small, pinned versions)?

## DEPLOY STEPS (P4)

1. Vercel backend env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (for example `mailto:you@example.com`). The user generates the keys with `npx web-push generate-vapid-keys`. Agents must NOT generate or store real keys. Also set `CRON_SECRET` (long random string). Without VAPID keys push is a silent no-op; without `CRON_SECRET` the cron endpoint fails closed.
2. Cron: `backend\vercel.json` registers `0 0 * * *` (daily, Hobby limit) for the cleanup route. Verify it appears in the Vercel dashboard after deploy.
3. MongoDB Atlas: the DB user needs `createIndex` permission. TTL and unique indexes (conversations, messages, reported flags, rate counters, push subscriptions, ride matches) are auto-created on first start; confirm them under Collections > Indexes.
4. iOS caveat: Web Push on iPhone works only for the app added to the Home Screen (iOS 16.4+). Android is best effort. In-app badges (Chat unread, Offers & Requests) are the main fallback.
5. Users must refresh and log in again: `/auth` responses no longer include phone or email, and the stored user shape is now `{ id, name, role }`.
6. Deploy the new frontend build TOGETHER with the backend. The frontend now depends on `/api/chat`, `/api/push` and `/api/auth/profile`, and no longer shows WhatsApp links.

## P5 DONE (matching + filters)

- Engine: `backend\utils\matching.js` (pure, read-only, never changes status). Levels EXACT (same vehicle, availableSeats >= count, within 30 min, destination + pickup match), CLOSE (within 90 min, pickup shares a meaningful token), ALTERNATIVE (different vehicle or up to 120 min; every ALTERNATIVE, including a different vehicle, stays within the 120 min window; reasons always name the difference). BIKE request sees CAR rides only as ALTERNATIVE; BIKE ride only fits count 1. Thresholds and `FILLER_WORDS` are exported constants. Candidates are filtered at read time (same date, ACTIVE, `expiresAt > now`, seats > 0, driver != passenger); TTL is never relied on.
- Endpoints: `GET /api/requests/:id/matches` (owner only, others 404), `GET /api/rides/:id/matching-requests` (owner driver only, others 404), `GET /api/requests/matches/counts` (batched count for "Possible matches (n)"). No contact data or other-user ids in any response; `existingMatch` PENDING/ACCEPTED is included.
- Count cost: 2 queries per call regardless of request count (the caller's active requests, plus one ride query over their distinct dates, selected fields, capped at 300). Single-match lists are capped at 100 candidates. Past the cap counts are a lower bound.
- Filters: `GET /api/rides` gains timeFrom, timeTo, minSeats (1..6), pickup, destination; `GET /api/requests` gains passengers (max passengers the driver can seat), vehicle (alias of vehicleType; must agree if both are sent), plus timeFrom > timeTo check. Strings only (arrays/objects give 400), length limited to 50, regex-escaped. Existing `keyword` still ignores non-strings (unchanged behaviour). Shared validators in `backend\utils\queryValidation.js`.
- Decision: an ALTERNATIVE ride with a different vehicle cannot link `requestId` (server rejects a vehicle mismatch), so "Request to Join" sends `passengerCount` without `requestId` in that case, and the driver side shows no "Offer my ride" button, only a note.
- UI: Possible matches link on My Requests, `RequestMatches` and `RideMatchingRequests` pages (grouped Exact/Close/Alternative, reason chips, safety line), driver-mode "Matching requests" link on My Rides, Feed filter panel (collapsed by default on mobile, Passenger mode; Driver mode filters passenger requests on the Requests page, which gains Max passengers and a collapsible panel).
- Future idea left untouched: nearby pickup zones.
