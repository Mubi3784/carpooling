# Implementation Plan: mode-scoped two-tab Home (Option D) + chat bubble alignment

Project root: `d:\Mubashir\carpooling\carpooling` (backend `backend\`, frontend `frontend\`).
Status: PLAN ONLY. No code was written in the planning step.
Inputs read: `mode-and-contact-investigation.md` (Bug 1 root cause, Option D = APPROVED, section 5), `two-sided-carpooling-plan.md` (FINAL DECISIONS 1-16), `p4c-verification.md`, and every file listed in section 2.

---

## 0. Rules for the implementing agent (Windows PowerShell quirks)

1. The shell tool ignores `cwd`. EVERY command must start with `Set-Location <abs path>;`.
2. Use `npm.cmd`, never `npm`.
3. Terminal output is unreliable. ALWAYS redirect to a temp log and read it with `read_file`:
   - `Set-Location d:\Mubashir\carpooling\carpooling\frontend; npm.cmd run build *> $env:TEMP\fe-build.log`
   - then `read_file C:\Users\Bismah\AppData\Local\Temp\fe-build.log` (or the equivalent `$env:TEMP` path).
   - Pass an explicit `timeout` (build/test: 600000 ms). Run ONE heavy process at a time (never build and test in parallel).
4. NO browser automation of any kind (a previous attempt was cancelled by the user). Verification = build, lint, tests only.
5. Do NOT `git commit`. No `git push`.
6. Never read or print `backend\.env` (or `frontend\.env*`) values.
7. No new npm packages. No scripts against production data. No production calls.
8. The `grep_search` tool needs `**/` prefixed `includePattern` values (e.g. `**/frontend/src/**/*.jsx`) and skips `dist`; use `read_file` for files.
9. `npm.cmd test` in `frontend` must be run AFTER `npm.cmd run build` (some tests, e.g. `sw-push.test.js`, assert on `dist\`; a stale `dist` fails them).
10. Existing frontend tests are pure `node:test` files in `frontend\tests\*.test.js` that import `.js` utils and read `.jsx` as text for source-wiring checks. There is no DOM/React test library and none may be added. Node cannot import `.jsx`, so all decision logic that needs a test goes into pure `.js` utils; components stay thin and are covered by source-wiring tests.
11. Baselines to compare against (from `p4c-verification.md`, last recorded): frontend lint 0 errors / 20 warnings; frontend tests 78 pass; backend 137 pass (5 suites, `jest --runInBand`). Re-measure before editing (step 0 below) rather than trusting these.

---

## 1. Scope

IN SCOPE (exactly two items):
1. Bug 1, approved Option D: mode-scoped two-tab Home at route `/` (`Feed.jsx`).
2. Chat bubble alignment in `ChatThread.jsx`.

EXPLICITLY OUT OF SCOPE (do not touch, do not plan):
- "Message Driver / Message Passenger" relabel and intro note (Bug 2 Option 1, `RideMatch.note`), any other contact/chat entry-point work. User has not decided.
- Seat-stepper N1 fix (MyRides `+`/`-`), any seat logic change.
- Bottom nav, Navbar, `Active.jsx` (keeps working unchanged), `Matches.jsx`, `RideDetails.jsx`, `OfferRide.jsx`, `RequestRide.jsx`, push, cron, matching engine, time-zone migration.
- `Home.jsx` (dead page, not routed) stays untouched.
- Backend contracts: NO source change planned (see 3.4). Only backend TEST additions.

---

## 2. Findings from reading the code (ground truth for the plan)

### 2.1 Home (Item 1)
- `frontend\src\pages\Feed.jsx` is the `/` route. `fetchRides` always calls `api.get('/rides', { params })` (about line 83) and always renders `<RideCard>`. `useMode().isDriver` only toggles the filter panel (`!isDriver` block), two Driver shortcut links (`My Rides` -> `/active`, `Passenger Requests` -> `/requests`), `paramsKey` (`isDriver ? {} : ...`) and empty-state copy. Root cause confirmed.
- State in Feed worth keeping: `requestId` ref guard, debounce of filters (400 ms) into `applied`, `buildFeedParams`/`countActiveFilters`/`emptyMessage` from `utils\matches.js`, NLP search (`parseCommuteQuery`, `matchesLandmark`, `isDepartureInTimeWindow`, `TIME_WINDOWS` from `utils\nlpSearchParser.js`) and the in-memory keyword filter (uses `pickupLocation`, `destination`, `departureTime`, which ALSO exist on request objects), Today/Tomorrow/custom date tabs, Car/Bike filter group, `LoadingSkeleton`, `OfflineNotice`, error + Retry block, `InstallSection`, `ModeSwitcher`, `ModeFab`.
- `GET /api/requests` (`requestController.getRequests`) accepts: `date` (YYYY-MM-DD), `vehicleType` (CAR|BIKE; `vehicle` alias), `timeFrom`, `timeTo` (HH:mm, from <= to), `keyword`, `passengers` (1..6 = max passengers), returns up to 100 ACTIVE non-expired requests of OTHER users (`passenger: { $ne: req.user._id }`), via `browseView`: `id, pickupLocation, destination, requestDate, departureTime, departureDateTime, vehiclePreference, passengerCount, notes, status, passenger: { name: <first name> }`. Own requests are server-excluded, so a "This is your request" note can never trigger in the Passenger Requests tab (browseView has no passenger id either); do not build dead code for it.
- `GET /api/rides` (public, `optionalAuth`) returns `driver: { id, name }` for each ride, INCLUDING the viewer's own rides. So the "This is your ride" note is implementable client-side in Available Rides via `String(ride.driver?.id) === String(user.id)` (`AuthContext` user is `{ id, name, role }`, `id` already a string via `utils\safeUser.js`).
- `GET /api/rides/my-rides` (`getMyRides`) returns all the driver's rides (status ACTIVE/FULL, `seriesId`, `availableSeats`, `totalSeats`, `vehicleType`, ...). `GET /api/requests/mine` returns owner view with derived `status` (ACTIVE/MATCHED/CANCELLED/EXPIRED), `seriesId`, `pendingMatchCount`.
- `services\api.js` has `getMyRequests`, `getRequests`, `getRequestMatchCounts`, `deleteRequest`, `deleteRequestSeries`, `deleteRide`, `deleteRideSeries`, `createMatch`, `getRidesForOffer` but NO `getMyRides` and NO `getRides` (MyRides.jsx and Feed.jsx call `api.get(...)` directly). Add both (additive).
- `MyRides.jsx` (props `{ embedded }`) = header + fetch (`/rides/my-rides`) + `groupRidesBySeries` grouped display + per-date seat controls, per-date/series cancel via `ConfirmationModal`, `MatchingLink` (driver mode). Error state has NO Retry. Used by `Active.jsx` (`<MyRides embedded />`) and route `/my-rides`.
- `MyRequests.jsx` (props `{ embedded }`) = header + `getMyRequests` + `getRequestMatchCounts` + `groupRequestsBySeries` + `StatusBadge` (text + icon) + per-date and series cancel + "Possible matches (n)" link. Error state has NO Retry. Used by `Active.jsx` and route `/my-requests`.
- `Requests.jsx` (route `/requests`, protected) contains `OfferPicker` (modal, `getRidesForOffer`, `createMatch` with idempotent `clientMatchId`) and an inline request card with the "Offer my ride" button. Error state has NO Retry. Its filter form is submit-based (no Today/Tomorrow tabs). The page stays (Active links to it) but must be refactored to share the card and picker.
- `ModeContext` (`mode`, `setMode`, `isDriver`; key `carpool_mode`), `utils\mode.js` (`fabConfig`, `normalizeMode`, storage helpers with try/catch), `ModeSwitcher` (radiogroup). `AuthContext` exposes `{ user, loading, isAuthenticated, ... }`; `loading` is true until `/auth/me` resolves when a token exists.
- `App.jsx`: `/` -> `<Feed />`, `/requests`, `/my-rides`, `/my-requests`, `/active` protected. Router unchanged.
- Existing tests referencing these pages: only text scans of `ChatThread.jsx`/`ChatList.jsx` in `tests\chat.test.js`. No test pins Feed/MyRides/MyRequests/Requests markup, so the refactor is safe.

### 2.2 Chat (Item 2): ROOT CAUSE ANALYSIS (read this first)
What the code actually does today (read, not assumed):
- Backend `chatController.messageView(m, viewerId)` returns exactly `{ id, mine, body, createdAt, readAt }` with `mine: String(m.sender) === String(viewerId)`; every route (`getMessages`, `sendMessage` incl. replay and duplicate paths) calls it with `req.user._id` (an ObjectId from `protect`, `User.findById(...).select('-password')`). The sender id is DELIBERATELY not returned (module header: "No ids of users ... anywhere"). Backend test `tests\chat.test.js` (polling test) already asserts `mine === false` for the receiver and `mine === true` for the sender on GET. An older e2e script also asserted the key set `["body","createdAt","id","mine","readAt"]`.
- Frontend `ChatThread.jsx` ALREADY branches on `m.mine`: row `flex ${m.mine ? 'justify-end' : 'justify-start'}`, own bubble `bg-emerald-600 text-white`, other `bg-white border`. Optimistic messages are created with `mine: true`; `deliver()` merges `{ ...saved, mine: true }`. The built `dist\assets\index-*.css` contains `justify-end` (checked), so Tailwind generated the utilities. `AuthContext` user `id` is a string, but ChatThread never needs it because the API supplies `mine`.
- So the user's premise (`message.sender_id === currentUserId`) does not match this API: there is no sender id on the wire, by design, and the current code does not do that comparison. A static read finds NO wrong field name, NO id type mismatch and NO whitelisting that drops `mine` (the whitelist keeps it). I could not run the app or a browser (not allowed), so I could not reproduce the "everything on the left" symptom.

Ranked hypotheses the implementer must keep in mind (the fix below is built to survive all of them, and the final report must say honestly which one could not be confirmed):
1. Stale client: `vite.config.js` uses `VitePWA({ registerType: 'prompt' })`, so an installed PWA / cached tab keeps serving an OLD precached shell until the user accepts the update prompt. An older ChatThread (before `mine` handling) renders everything left. Needs: deploy + "accept the update / hard reload" note to the user.
2. Stale or different backend deployment that does not return `mine` (then `m.mine` is `undefined` => every row falls to `justify-start`, exactly the reported symptom). Needs: backend redeploy; the client helper below makes this visible instead of silent.
3. Layout robustness: alignment relies on a single `justify-end` on the row; if the row ever shrink-wraps (e.g. `max-w` + `w-fit` containers) bubbles all appear left. Fix: make rows `w-full` AND put `ml-auto` / `mr-auto` on the bubble itself AND keep `justify-*`.
4. Contrast/visual distinction is weak: `bg-emerald-600 text-white` is ~3.8:1 (below WCAG AA 4.5:1 for 14 px text), received bubble `bg-white` on `bg-slate-50` is barely distinct. Fix with `bg-emerald-700` (about 5.5:1) and a neutral `bg-slate-100`.

Decision (one approach, no alternatives left to the implementer): compute sidedness through ONE pure helper `isOwnMessage(message, currentUserId)` in `utils\chat.js`:
- If `typeof message.mine === 'boolean'` use it (server-computed, primary, no private data).
- Else compare as strings the first present of `message.senderId`, `message.sender_id`, `message.sender?.id`, `message.sender?._id`, `message.sender` against `currentUserId` using `String(a) === String(b)` (handles ObjectId vs string, number vs string).
- Else `false` (unknown sender is never shown as own).
No backend source change: the boolean the user asked us to prefer already exists and is correct; adding a sender id would leak a user id the privacy design excludes.

### 2.3 Test layout/conventions found
- Frontend: `frontend\package.json` scripts: `build` = `vite build`, `lint` = `oxlint`, `test` = `node --test tests/*.test.js`. Test files use `import test from 'node:test'`, `assert from 'node:assert/strict'`, `fs.readFileSync(new URL('../src/...', import.meta.url), 'utf8')` for source checks, and fake storage objects for storage helpers (see `tests\mode.test.js`, `tests\nav.test.js`, `tests\chat.test.js`).
- Backend: `backend\tests\chat.test.js` (Jest + supertest + mongodb-memory-server-core). Helpers in that file: `makeChat()` (returns `{ d, p, conv }` = driver, passenger, conversation), `post(user, convId, text)`, `getMsgs(user, convId, qs)`, `auth(user)`, `makeUser()`. Reuse them, do not invent new setup. `npm.cmd test` = `jest --runInBand`.

---

## 3. Design decisions (brief rationale)

3.1 Tab model. Pure module `frontend\src\utils\homeTabs.js` is the single source of truth for: tab labels per mode, default/persisted tab, mapping `(mode, tab, isAuthenticated)` -> data source, request-feed params, empty-state copy, keyboard navigation, keyword filtering. Reason: components cannot be unit-tested here (no DOM lib), so all behaviour that must be proven ("never the wrong API call", "default is My tab", "guest behaviour") lives in pure code with tests.

3.2 Persistence. Last selected tab per mode is stored in `sessionStorage` (keys `carpool_home_tab_driver`, `carpool_home_tab_passenger`). Reason: it survives in-session navigation (ride details -> Back) but a fresh app launch/new tab ALWAYS starts on the "My ..." tab, satisfying "persist, but always default to My on first load". Stored values are validated against the mode's tab ids; invalid/throwing storage falls back to the default. The effective tab is DERIVED (`choice[mode] ?? defaultTab(mode, isAuthenticated)`), not synced with effects, so no set-state-in-effect warnings and no stale tab after a mode switch.

3.3 Guests. Public rides feed stays visible. Passenger Mode guest default = `feed` (Available Rides); "My Requests" tab for guests shows a login prompt. Driver Mode guest: default `my`, both tabs show a login prompt ("Log in to ..."), because both need an account. While `useAuth().loading` is true render `LoadingSkeleton` (do not fetch or pick a default yet), so a logged-in user is never flashed the guest default.

3.4 Backend. NO change for either item. Item 1 uses existing endpoints and fields (verified above). Item 2 already has `mine`. Only tests are added. If, while implementing, a missing field is truly found, the change must be additive with a test; none is expected.

3.5 Data isolation / refetch. The tab panel is rendered with `key={`${mode}-${tab}`}`; every panel owns its fetch and unmounts on switch, so a previous mode's list can never be shown in another tab and state (filters, search, dates, pickers) resets on mode/tab change. Out-of-order protection: `DiscoveryFeed` keeps the `requestId` ref guard; the two `My...List` components use an effect-local `cancelled` flag (and a request counter for Retry). Each discovery kind has its own panel so `getRides` and `getRequests` can never feed the same state.

3.6 Shared components (no duplication, as required): `MyRidesList` and `MyRequestsList` (extracted bodies of MyRides/MyRequests), `RequestCard` + `OfferPicker` (extracted from Requests.jsx), `DiscoveryFeed` (extracted from Feed.jsx, parameterised by `kind`), `HomeTabs` (accessible tablist), `LoginPrompt`.

---

## 4. Ordered implementation items

Each item leaves the repo buildable. Do items in this order (later items depend on earlier ones as stated).

- [ ] 0. Baseline measurement (no edits).
      Run, one at a time, with the log pattern: frontend `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test`; backend `npm.cmd test`. Record pass counts and lint warning count in a scratch note for the final report. If a baseline run FAILS before any edit, stop and report (do not "fix" unrelated failures silently).
      Files: none.
      Verify: logs read back; counts recorded.

### Part A: Item 2 (chat alignment). Independent of Part B; do first (small).

- [ ] 1. Add pure chat bubble helpers to `frontend\src\utils\chat.js` and their tests.
      Add and export:
      - `isOwnMessage(message, currentUserId)` exactly as in 2.2 (boolean `mine` first; then string-compared `senderId`/`sender_id`/`sender?.id`/`sender?._id`/`sender`; else `false`; tolerate `null` message).
      - `bubbleView(message, { currentUserId, otherName })` returning `{ own, side: 'right'|'left', rowClass, bubbleClass, metaClass, srLabel, status, canReport }`:
        - `rowClass`: own `'flex w-full justify-end'`, other `'flex w-full justify-start'`.
        - `bubbleClass` common: `'min-w-0 max-w-[80%] rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]'`; own adds `'ml-auto rounded-br-md bg-emerald-700 text-white'`; other adds `'mr-auto rounded-bl-md border border-slate-200 bg-slate-100 text-slate-900'`.
        - `metaClass`: own `'text-emerald-50'` (readable on emerald-700), other `'text-slate-600'`; both include `'mt-1 flex flex-wrap items-center gap-2 text-[11px]'`; own is right-aligned (`justify-end`).
        - `srLabel`: own `'You said'`; other `` `${otherName || 'They'} said` ``.
        - `status`: for own: `'sending'` when `message.status === 'sending'`, `'failed'` when `'failed'`, else `'sent'`; `null` for other.
        - `canReport`: `!own && Boolean(message.id)` (report only on the OTHER person's persisted messages; never on own or optimistic).
      Tests: new `frontend\tests\chatBubble.test.js` (node:test) covering: sent (`mine: true`) -> `side 'right'` and own classes (`justify-end`, `ml-auto`, `bg-emerald-700`); received (`mine: false`) -> `'left'` (`justify-start`, `mr-auto`, neutral bg); optimistic `{ mine: true, status: 'sending', no id }` -> right, status `sending`, `canReport` false; failed -> right, status `failed`; id-type mismatch with no `mine`: `{ senderId: <object with toString() returning 'abc123'> }` vs `'abc123'` -> own, `{ sender_id: 42 }` vs `'42'` -> own, `{ sender: { _id: 'x' } }` vs `'y'` -> not own; no signal at all -> left and not own; `mine: 'true'` (string) is NOT treated as boolean and falls through to the id comparison; `canReport` true only for other + has id; `srLabel` strings; class strings include `max-w-[80%]` and `[overflow-wrap:anywhere]`; a hostile body like `<img src=x onerror=alert(1)>` passes through unchanged (helpers never touch body).
      Files: `frontend\src\utils\chat.js`, `frontend\tests\chatBubble.test.js` (new).
      Verify: `Set-Location d:\Mubashir\carpooling\carpooling\frontend; npm.cmd test *> $env:TEMP\fe-test.log` -> new tests pass; existing `chat.test.js` still passes. (Run build first if a `dist` assertion complains.)

- [ ] 2. Create `frontend\src\components\MessageBubble.jsx` and use it in `ChatThread.jsx`. (Needs item 1.)
      `MessageBubble({ message, currentUserId, otherName, onRetry, onReport })`: calls `bubbleView`; outer `<div className={view.rowClass} data-side={view.side}>`; inner `<div className={view.bubbleClass}>`; body as `<p className="whitespace-pre-wrap [overflow-wrap:anywhere]"><span className="sr-only">{view.srLabel}: </span>{message.body}</p>` (React text child only, never HTML injection APIs); meta row (`view.metaClass`, right-aligned for own) with the time (`toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`, as today), then for own: `Sending...` / `Failed to send` + `Retry` button (`onRetry(message)`) / `Sent`; for other with `canReport`: the existing Report button with `aria-label="Report this message"` (`onReport(message)`). Keep text sizes/touch behaviour of the current markup; Retry/Report buttons keep `underline font-semibold`.
      In `ChatThread.jsx`: import `useAuth`, `MessageBubble`; `const { user } = useAuth();`; `const otherName = String(convo?.otherParty?.name || '').split(' ')[0];` replace the inline `messages.map(...)` markup with `<MessageBubble key={m.id || m.clientMessageId} message={m} currentUserId={user?.id} otherName={otherName} onRetry={retry} onReport={(msg) => { setReason('harassment'); setReportTarget(msg); }} />`. Keep `role="log"`, polling, report dialog, optimistic `mine: true` creation and `{ ...saved, mine: true }` merge exactly as they are. Do not change the list container's `max-h`/scroll behaviour. Confirm no horizontal overflow risk at 390 px by construction: row `w-full`, bubble `min-w-0 max-w-[80%]` with `[overflow-wrap:anywhere]`, no fixed widths.
      Source-wiring tests (append to `frontend\tests\chatBubble.test.js`): `MessageBubble.jsx` and `ChatThread.jsx` contain no `dangerouslySetInnerHTML|innerHTML`; `ChatThread.jsx` imports `MessageBubble` and no longer contains the literal `'justify-end'`; `MessageBubble.jsx` imports `bubbleView` from `../utils/chat`, renders `{message.body}`, contains `sr-only`, `data-side`, `Report this message`, `Retry`; the existing `tests\chat.test.js` text scan (it reads `ChatThread.jsx` for `pollDelay`, `visibilitychange`, `classifyChatError`) must still pass (those stay in ChatThread).
      Files: `frontend\src\components\MessageBubble.jsx` (new), `frontend\src\pages\ChatThread.jsx`, `frontend\tests\chatBubble.test.js`.
      Verify (in this order, each with log redirect): frontend `npm.cmd run lint` (0 errors), `npm.cmd run build` (success), `npm.cmd test` (all pass). Then `read_file` the CSS check: confirm the built CSS has the new utilities by running `Set-Location ...\frontend; $c = Get-Content (Get-ChildItem dist\assets\index-*.css | Select-Object -First 1).FullName -Raw; "emerald700=$($c.Contains('bg-emerald-700')) justifyEnd=$($c.Contains('justify-end')) overflowAnywhere=$($c.Contains('overflow-wrap:anywhere'))" *> $env:TEMP\css.log` (sanity only; Tailwind v4 auto-detects classes inside `utils\chat.js`; if a class is missing, inline it as a literal in `MessageBubble.jsx`).

- [ ] 3. Backend contract tests for the message view (TEST ONLY; no backend source change).
      In `backend\tests\chat.test.js`, inside the existing chat describe that uses `makeChat()`, add tests: (a) POST `/api/chat/conversations/:id/messages` as passenger returns 201 with `data.mine === true`; the same message fetched via GET as the driver has `mine === false` and as the passenger `mine === true` (per-participant correctness, mixed senders in one conversation, e.g. passenger sends 2, driver sends 1, each GET shows the right booleans in order); (b) an idempotent replay (same `clientMessageId`) returns 200 `replayed: true` with `mine === true` for the sender; (c) the message view's key set is exactly `['body','createdAt','id','mine','readAt']` and `JSON.stringify` of the response bodies contains none of: either participant's email, phone, `whatsappNumber`, or either user's `_id` string. First grep `backend\tests\chat.test.js` to avoid duplicating assertions that already exist (GET `mine` booleans exist; extend only what is missing: POST `mine`, replay `mine`, key set, no-private-data, mixed senders).
      Files: `backend\tests\chat.test.js`.
      Verify: `Set-Location d:\Mubashir\carpooling\carpooling\backend; npm.cmd test *> $env:TEMP\be-test.log` -> all suites pass, new tests included, total >= baseline.

### Part B: Item 1 (two-tab Home)

- [ ] 4. Add `getMyRides` and `getRides` to `frontend\src\services\api.js`.
      `export const getMyRides = () => api.get('/rides/my-rides');` and `export const getRides = (params) => api.get('/rides', { params });` placed with the other ride helpers. No behaviour change yet.
      Files: `frontend\src\services\api.js`.
      Verify: `npm.cmd run build` succeeds (log pattern).

- [ ] 5. Create the pure module `frontend\src\utils\homeTabs.js` and `frontend\tests\homeTabs.test.js`. (Needs nothing; later items import it.)
      Export:
      - `HOME_TAB_KEYS = { driver: 'carpool_home_tab_driver', passenger: 'carpool_home_tab_passenger' }`.
      - `HOME_TABS = { driver: [{ id: 'my', label: 'My Rides' }, { id: 'feed', label: 'Passenger Requests' }], passenger: [{ id: 'my', label: 'My Requests' }, { id: 'feed', label: 'Available Rides' }] }`; `tabsForMode(mode)` using `normalizeMode` from `./mode`.
      - `isValidTab(mode, id)`; `defaultTab(mode, isAuthenticated)` -> `'feed'` only for passenger guests, else `'my'`; `resolveTab({ mode, isAuthenticated, choice })` -> `choice` if valid for the mode else `defaultTab`.
      - `readTab(storage, mode)` / `writeTab(storage, mode, id)` (try/catch, validates, returns `null` when absent/invalid, writes only valid ids; same style as `readMode/writeMode` in `utils\mode.js`).
      - `sourceFor(mode, tab, isAuthenticated)` -> one of `'my-rides' | 'requests' | 'my-requests' | 'rides' | 'login'`: driver+my -> `my-rides`; driver+feed -> `requests`; passenger+my -> `my-requests`; passenger+feed -> `rides`; any source other than passenger+feed with `isAuthenticated === false` -> `'login'`. Also `SOURCE_PATH = { 'my-rides': '/rides/my-rides', requests: '/requests', 'my-requests': '/requests/mine', rides: '/rides' }`.
      - `nextTabId(tabs, currentId, key)` for `ArrowRight/ArrowDown` (next, wraps), `ArrowLeft/ArrowUp` (previous, wraps), `Home`, `End`; unhandled key returns `currentId`.
      - `buildRequestFeedParams({ date, vehicle, filters })` -> `{ params }` or `{ error }`: `date` (if given), `vehicleType` when `vehicle` is `CAR|BIKE` (not `ALL`), `timeFrom/timeTo` validated by calling `buildFeedParams({ timeFrom, timeTo })` from `./matches` (propagate its error), `passengers` as string when integer 1..6 else `{ error: 'Passengers must be 1 to 6' }`. Never emits keyword (keyword filtering stays client-side, see below).
      - `filterByKeyword(items, searchKeyword, parsed)` : move the in-memory filter currently inline in `Feed.jsx` verbatim (plain-substring branch when `!parsed.hasTokens`; NLP branch with `matchesLandmark`, `isDepartureInTimeWindow`, `cleanKeyword`) into this pure function; works for rides AND requests since both have `pickupLocation`, `destination`, `departureTime`.
      - `emptyStateFor({ mode, tab, isAuthenticated })` -> `{ title, body, ctaLabel, ctaTo }`: driver/my `{ 'No rides posted yet', cta 'Offer a ride' -> '/offer-ride' }`; passenger/my `{ 'You have no requests', cta 'Post a request' -> '/request-ride' }`; driver/feed `{ 'No open passenger requests for this date' }` (CTA 'Offer a ride' -> '/offer-ride'); passenger/feed `{ 'No rides available for this date' }` (CTA 'Post a request' -> '/request-ride'). CTA targets for guests are replaced by `/login` in the component (not here).
      - `loginPromptFor({ mode, tab })` -> friendly text per tab, e.g. driver/my 'Log in to see and manage the rides you posted.', driver/feed 'Log in to browse passenger requests and offer your ride.', passenger/my 'Log in to see your ride requests.'.
      Tests (`homeTabs.test.js`, node:test, fake storage like `mode.test.js`):
      1. Labels exactly: driver `['My Rides','Passenger Requests']`, passenger `['My Requests','Available Rides']`; `tabsForMode('garbage')` -> passenger.
      2. Default is `'my'` for both modes when authenticated, with no stored choice; passenger guest default `'feed'`; driver guest default `'my'`.
      3. Persistence: keys are `carpool_home_tab_driver` / `carpool_home_tab_passenger`; round trip per mode is independent (writing driver `feed` does not change passenger); invalid stored value / unknown tab id / throwing storage -> `null` -> default `'my'` (authenticated).
      4. Data-source mapping and ISOLATION: iterate every `(mode, tab, auth)` combination; assert the exact map above; assert driver never maps to `'my-requests'` or `'rides'`; passenger never maps to `'my-rides'` or `'requests'`; assert `SOURCE_PATH` for each source; guests map to `'login'` for every combination except passenger+feed.
      5. `nextTabId` arrows/Home/End/wrap/unknown key.
      6. `buildRequestFeedParams`: date only; CAR/BIKE emitted, ALL omitted; times valid/invalid (`'25:00'`, from > to -> error); passengers `'0'`, `'7'`, `'x'` -> error, `'3'` ok; empty fields omitted.
      7. `filterByKeyword`: empty keyword returns all; plain substring on pickup/destination case-insensitive; NLP query (e.g. parsed with `parseCommuteQuery('kal subah nust')`) filters by landmark and time window; works on request-shaped objects.
      8. `emptyStateFor` exact titles/CTAs per the table; `loginPromptFor` non-empty per tab.
      Files: `frontend\src\utils\homeTabs.js` (new), `frontend\tests\homeTabs.test.js` (new).
      Verify: `Set-Location ...\frontend; npm.cmd test *> $env:TEMP\fe-test.log` -> all pass.

- [ ] 6. Extract `MyRidesList` and `MyRequestsList`; make `MyRides.jsx` / `MyRequests.jsx` thin wrappers. (Needs item 4.)
      Create `frontend\src\components\MyRidesList.jsx`: move everything from `MyRides.jsx` EXCEPT the page header/outer wrapper: state, fetch (switch to `getMyRides()` from api.js), `handleUpdateSeats`, delete modal handlers, `MatchingLink`, the grouped-series and single-ride JSX, `ConfirmationModal`. Keep behaviour byte-for-byte except: (a) fetch is guarded by a request counter/cancelled flag so unmounting or Retry cannot apply stale data; (b) error block becomes `role="alert"` with a Retry button calling the fetch; (c) the empty state reads `empty` props with defaults equal to today's copy (`'No active rides offered'`, `"You haven't posted any upcoming trips yet."`, CTA `Offer a Ride` -> `/offer-ride`) so `Active.jsx` and `/my-rides` look unchanged; the Home passes `empty={{ title: 'No rides posted yet', body: 'Post a ride so passengers can find you.', ctaLabel: 'Offer a ride', ctaTo: '/offer-ride' }}` taken from `emptyStateFor`. Do NOT alter seat-stepper logic (out of scope).
      Create `frontend\src\components\MyRequestsList.jsx` the same way from `MyRequests.jsx` (keep `STATUS_STYLE`/`StatusBadge`, `getMyRequests`, batched `getRequestMatchCounts` failing softly, `pendingTotal` banner, per-date and series cancel, "Possible matches (n)" link). Add the Retry button to its error block and the `empty` prop (default today's copy 'No requests yet'; Home passes 'You have no requests' / 'Post a request' -> `/request-ride`).
      `MyRides.jsx` and `MyRequests.jsx` keep their exact props (`embedded`) and headings and render `<MyRidesList />` / `<MyRequestsList />` below the header.
      Files: `frontend\src\components\MyRidesList.jsx` (new), `frontend\src\components\MyRequestsList.jsx` (new), `frontend\src\pages\MyRides.jsx`, `frontend\src\pages\MyRequests.jsx`.
      Verify: frontend `npm.cmd run lint` (0 errors), `npm.cmd run build` succeeds, `npm.cmd test` passes. (`Active.jsx` still compiles because the wrappers keep their props.)

- [ ] 7. Extract `OfferPicker` and `RequestCard`; refactor `Requests.jsx` to use them and add Retry. (Needs item 4 only for imports hygiene.)
      Create `frontend\src\components\OfferPicker.jsx` by moving `OfferPicker` verbatim from `Requests.jsx` (including `createClientRequestId` idempotency, `getRidesForOffer`, `createMatch`, "You have no eligible ride on this date, post one first.", focus/ARIA as is). Create `frontend\src\components\RequestCard.jsx`: `RequestCard({ request, onOffer })` rendering the existing card: pickup -> destination, `VehicleBadge vehicleType={request.vehiclePreference}` (text badge), `formatDateChip(requestDate)` weekday+label, `formatTime12Hour(departureTime)`, passenger count ("N passenger(s)"), first name only (`request.passenger?.name`), `notes` when present, and the "Offer my ride" button calling `onOffer(request)`. Notes are rendered as a text child. Give the root `<li>` `className` unchanged.
      `Requests.jsx`: import both, delete the inline copies, keep its submit-based filter form and the info banner; add a Retry button to the error block (and keep the OfflineNotice Retry). Its list renders `<RequestCard key={r.id} request={r} onOffer={setPicker} />` and `{picker && <OfferPicker key={picker.id} target={picker} onClose={() => setPicker(null)} />}`.
      Files: `frontend\src\components\OfferPicker.jsx` (new), `frontend\src\components\RequestCard.jsx` (new), `frontend\src\pages\Requests.jsx`.
      Verify: frontend `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd test` (log pattern each).

- [ ] 8. Create `HomeTabs.jsx` and `LoginPrompt.jsx`. (Needs item 5.)
      `frontend\src\components\HomeTabs.jsx`: `HomeTabs({ tabs, selected, onSelect, label })`. Markup: `<div role="tablist" aria-label={label} onKeyDown=...>` with one `<button type="button" role="tab" id={`home-tab-${id}`} aria-selected aria-controls="home-tabpanel" tabIndex={selected ? 0 : -1}>` per tab; visible text labels only (no icon-only), selected style also carries a non-color cue (bold + bottom border/check like `ModeSwitcher`); `min-h-[44px]`; arrow/Home/End via `nextTabId` (preventDefault, call `onSelect`, focus the new tab via refs); focus-visible outline like `ModeSwitcher`. Must not overflow at 390 px: tabs `flex-1 min-w-0` with `truncate`. The panel wrapper (`role="tabpanel" id="home-tabpanel" aria-labelledby={`home-tab-${selected}`} tabIndex={0}`) is rendered by `Feed.jsx`.
      `frontend\src\components\LoginPrompt.jsx`: `LoginPrompt({ message })` -> card with the message and `<Link to="/login" state={{ from: { pathname: '/' } }}>Log in</Link>` plus `Register` link (`/register`); same visual language as the existing empty states (white rounded-2xl border).
      Files: `frontend\src\components\HomeTabs.jsx` (new), `frontend\src\components\LoginPrompt.jsx` (new).
      Verify: `npm.cmd run lint` and `npm.cmd run build` succeed (components are not yet used; that is fine).

- [ ] 9. Create `DiscoveryFeed.jsx` (the former Feed body, parameterised) and give `RideCard` an optional own-ride note. (Needs items 4, 5, 7.)
      `frontend\src\components\DiscoveryFeed.jsx`, prop `kind: 'rides' | 'requests'`. Move from `Feed.jsx` UNCHANGED in behaviour: Today/Tomorrow/custom-date segmented control (add `aria-pressed` on the two buttons; keep `getTodayDateString`/`getTomorrowDateString`), vehicle ALL/CAR/BIKE group, the 400 ms debounced `filters -> applied`, the search box with NLP pill (`parseCommuteQuery`, detected labels, `handleSearchChange`, `handleClearSearch`), `LoadingSkeleton`, `OfflineNotice` with Retry, error block with Retry, `requestId` ref out-of-order guard (set loading/error/offline exactly as today), in-memory keyword filtering now via `filterByKeyword` from `utils\homeTabs.js`.
      Differences by `kind`:
      - Fetch: rides -> `getRides({ date, ...vehicleType, ...built.params })` where `built = buildFeedParams(applied)` (pickup/destination/minSeats/time as today); requests -> `getRequests(buildRequestFeedParams({ date, vehicle, filters: applied }).params)`. Include `kind` in the effect dependencies and in the `fetchRef` so a kind change cannot reuse the other's params (the component is also `key`-ed by the parent).
      - Filter panel: rides = today's fields (Leaves after, Leaves before, Pickup, Destination, Minimum seats, Clear). requests = Leaves after, Leaves before, "Max passengers" select 1..6 (`passengers`), Clear. Use `id` prefixes unique per kind (`ff-*`) and keep `aria-expanded`/`aria-controls`/`role="group"`; show `filterError` as `role="alert"`. `countActiveFilters` already counts `passengers`.
      - Render: rides -> `<RideCard ride={ride} isOwn={!!user?.id && String(ride.driver?.id) === String(user.id)} />` (use `useAuth`); requests -> `<RequestCard request={r} onOffer={setPicker} />` and `{picker && <OfferPicker key={picker.id} target={picker} onClose={() => setPicker(null)} />}`.
      - Search placeholder/aria-label per kind ('Search rides by location, day or time' / 'Search passenger requests by location, day or time').
      - Error text per kind ('Unable to load rides. Please check your connection.' / 'Unable to load passenger requests. Please check your connection.'), `OfflineNotice what` ('current rides' / 'passenger requests').
      - Empty state: `emptyStateFor({ mode, tab: 'feed' })` title with the selected-day suffix only where needed; keep today's keyword/filter/vehicle-specific bodies; CTA is mode-aware via `fabConfig`/`emptyStateFor` and links to `/login` when not authenticated.
      `RideCard.jsx`: add optional prop `isOwn` (default false). When true render a small text badge "This is your ride" (text + not color-only, e.g. `bg-slate-100 text-slate-700 border`) near the driver footer. The card stays a `Link` to `/rides/:id` (own rides still open their details page). No other RideCard change.
      Files: `frontend\src\components\DiscoveryFeed.jsx` (new), `frontend\src\components\RideCard.jsx`.
      Verify: `npm.cmd run lint` (0 errors), `npm.cmd run build`, `npm.cmd test` succeed.

- [ ] 10. Rewrite `frontend\src\pages\Feed.jsx` as the tabbed orchestrator. (Needs items 6, 8, 9.)
      New Feed: keep the title block ("Available Carpools" heading can stay, subtitle unchanged), `ModeSwitcher`, `InstallSection`, `ModeFab`. Remove the Driver-mode shortcut links grid (superseded by the tabs; `/active` and `/requests` stay reachable via bottom nav / Active page). Logic:
      - `const { isAuthenticated, loading: authLoading } = useAuth(); const { mode } = useMode();`
      - `const [choice, setChoice] = useState(() => ({ passenger: readTab(sessionStorage, 'passenger'), driver: readTab(sessionStorage, 'driver') }));` (guard `typeof sessionStorage`, try/catch inside `readTab`).
      - `const tab = resolveTab({ mode, isAuthenticated, choice: choice[mode] });`, `const tabs = tabsForMode(mode);`
      - `onSelect = (id) => { setChoice((c) => ({ ...c, [mode]: id })); writeTab(sessionStorage, mode, id); }`.
      - Render `<HomeTabs tabs={tabs} selected={tab} onSelect={onSelect} label={mode === 'driver' ? 'Driver Mode sections' : 'Passenger Mode sections'} />` directly under `ModeSwitcher`.
      - Panel: `<div role="tabpanel" id="home-tabpanel" aria-labelledby={`home-tab-${tab}`} tabIndex={0} key={`${mode}-${tab}`}>`; inside: if `authLoading` -> `LoadingSkeleton`; else switch on `sourceFor(mode, tab, isAuthenticated)`: `'my-rides'` -> `<MyRidesList empty={...} />`; `'my-requests'` -> `<MyRequestsList empty={...} />`; `'requests'` -> `<DiscoveryFeed kind="requests" />`; `'rides'` -> `<DiscoveryFeed kind="rides" />`; `'login'` -> `<LoginPrompt message={loginPromptFor({ mode, tab })} />`. Keep the existing page `h1` ("Available Carpools") and subtitle unchanged to avoid copy churn.
      - The top-level `Feed` no longer imports `api`, `RideCard`, or the NLP/filter utilities.
      Behaviour checks by construction: default is "My ..." (authenticated); switching mode re-derives the tab from that mode's own `choice`, remounts the panel (new `key`), and refetches; no mode shares a list component instance with the other; guests see the public rides feed under Passenger Mode and login prompts elsewhere; `ModeFab` remains mode-aware.
      Files: `frontend\src\pages\Feed.jsx`.
      Verify: frontend `npm.cmd run lint` (0 errors; no new categories of warnings beyond the existing pattern), `npm.cmd run build` succeeds, `npm.cmd test` passes.

- [ ] 11. Source-wiring tests for the Home. (Needs item 10.)
      New `frontend\tests\homeWiring.test.js` (node:test, `fs.readFileSync(new URL('../src/...', import.meta.url), 'utf8')`):
      - `Feed.jsx`: imports `HomeTabs`, `MyRidesList`, `MyRequestsList`, `DiscoveryFeed`, `LoginPrompt`, `ModeSwitcher`, `ModeFab`, `sourceFor`, `resolveTab`, `readTab`, `writeTab`; uses `sessionStorage`; panel has `role="tabpanel"` and a `key=` containing `mode`; does NOT contain `api.get(`, `RideCard`, or `'/rides'` (Feed no longer fetches or renders cards itself); contains `authLoading`/`loading` handling.
      - `HomeTabs.jsx`: contains `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `nextTabId`, `tabIndex`.
      - `DiscoveryFeed.jsx`: contains `requestId` (out-of-order guard), `getRequests` and `getRides`, `RequestCard`, `RideCard`, `OfferPicker`, `Retry`, `filterByKeyword`, `OfflineNotice`; contains `kind` in the effect dependency text.
      - Shared-component enforcement (no duplicated card/list): `Offer my ride` string appears in `RequestCard.jsx` and `OfferPicker.jsx` only (not in `Requests.jsx`, `DiscoveryFeed.jsx`, `Feed.jsx` as a button label; the string `aria-label="Offer my ride"` of the picker dialog stays in `OfferPicker.jsx`); `Requests.jsx` and `DiscoveryFeed.jsx` both import `RequestCard`; `MyRides.jsx` imports `MyRidesList` and no longer contains `groupRidesBySeries`; `MyRequests.jsx` imports `MyRequestsList` and no longer contains `groupRequestsBySeries`; `Feed.jsx` imports the same list components as these pages (single source).
      - Retry present in `MyRidesList.jsx`, `MyRequestsList.jsx`, `Requests.jsx`, `DiscoveryFeed.jsx`.
      - `api.js` exports `getMyRides` hitting `/rides/my-rides` and `getRides` hitting `/rides` (regex on the file text) consistent with `SOURCE_PATH` from `homeTabs.js`.
      - Safety: none of the new/changed files contain `dangerouslySetInnerHTML`, `innerHTML` or `wa.me`.
      - `RideCard.jsx` contains `isOwn` and `This is your ride`.
      Also keep `Home.jsx` untouched (no assertion needed).
      Files: `frontend\tests\homeWiring.test.js` (new).
      Verify: `npm.cmd test` (after a fresh `npm.cmd run build`) -> all pass.

- [ ] 12. Final full verification and report (no more code unless a check fails).
      Run sequentially, each with `Set-Location <abs>; ... *> $env:TEMP\<name>.log` and read back with `read_file`:
      1. `Set-Location d:\Mubashir\carpooling\carpooling\frontend; npm.cmd run lint *> $env:TEMP\fe-lint.log` -> 0 errors (warning count not materially above the baseline measured in step 0; list any NEW warnings in files you created and fix those that are simple).
      2. `Set-Location d:\Mubashir\carpooling\carpooling\frontend; npm.cmd run build *> $env:TEMP\fe-build.log` -> success.
      3. `Set-Location d:\Mubashir\carpooling\carpooling\frontend; npm.cmd test *> $env:TEMP\fe-test.log` -> `fail 0`, count above the baseline by the new tests.
      4. `Set-Location d:\Mubashir\carpooling\carpooling\backend; npm.cmd test *> $env:TEMP\be-test.log` -> all pass (needed because `backend\tests\chat.test.js` changed in item 3).
      Then write `d:\Mubashir\carpooling\carpooling\.agents\tasks\modes-chat-fix-verification.md` containing: what changed (file list), command results with counts, the honest chat root-cause statement (code already had `mine`; hypotheses 1-4 from 2.2; which could not be confirmed without a browser/deployed environment), and a NOT VERIFIED list: real browser rendering at 390 px (no overflow, bubble alignment, tab bar layout, FAB/bottom-nav overlap), keyboard and screen-reader behaviour of the tab control and the `sr-only` bubble cues, live two-account end-to-end flow, and deployment (users with an installed PWA must accept the update prompt or reload; the backend must be the current build so `mine` is returned). Do not commit. Remove any temp files created in `$env:TEMP`.
      Files: `.agents\tasks\modes-chat-fix-verification.md` (new).
      Verify: all four commands green; report file written.

---

## 5. Acceptance mapping (user words -> checks)

- Driver Mode Tab 1 "My Rides" default; Tab 2 "Passenger Requests" feed with Offer-my-ride: items 5, 6, 7, 9, 10; tests 5 (labels/default/mapping), 11 (wiring).
- Passenger Mode Tab 1 "My Requests" default; Tab 2 "Available Rides": same items; test 5 mapping isolation.
- Accessible tabs (tablist/tab/tabpanel, arrows, aria-selected, text labels): items 8, 10; tests 5 (`nextTabId`), 11.
- Persistence per mode, default My on first load: item 5 (storage), item 10 (sessionStorage); tests 5.3.
- Refetch on switch, no cross-mode data, out-of-order guard: design 3.5, items 6, 9, 10; tests 5.4, 11.
- Loading/offline/error+Retry (incl. request lists), mode/tab empty states with CTAs: items 5, 6, 7, 9; tests 5.8, 11.
- Guests: items 5, 8, 10; tests 5.2, 5.4.
- "This is your ride" note: item 9 (rides only; own requests are server-excluded).
- FAB mode-aware, bottom nav untouched, filters/NLP preserved: items 9, 10 (moved, not rewritten).
- Chat: sent -> right with primary background, received -> left neutral, optimistic/failed right, id mismatch handled, report only on others' messages, plain text, long-word wrap, max width 80%, sr cue: items 1-2 (tests in `chatBubble.test.js`), backend contract: item 3.

## 6. Risks and notes for the implementer
- Do not change any backend source. If an unexpected missing field appears, STOP and add only an additive field plus a test, and say so in the report.
- Keep extracted code behaviourally identical (copy, don't "improve"): the seat stepper issue (N1) is explicitly out of scope even though it sits in the moved code.
- Lint (`oxlint`) previously showed react set-state-in-effect warnings for fetch-on-mount patterns; that pattern is accepted in this repo (warnings only). Errors must stay 0.
- Tailwind v4 scans `src` automatically, including `utils\chat.js` class strings; the CSS sanity check in item 2 confirms it.
- `Active.jsx` still imports `MyRides`/`MyRequests`; their public props must not change.
- Do not touch `backend\.env`; do not run any script against real data.
