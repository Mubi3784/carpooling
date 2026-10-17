# Join/Offer regression + tab-order change: investigation and fix plan

Evidence is in `join-regression-verification.md`. Short version: the backend passes a 33/33 live e2e of both flows (join and offer: request visible to the receiver, alert counter increments, accept reserves a seat and creates the conversation, listed for both, chat unread counters correct). So the break is on the frontend or in the deployment. No UI run could be completed (shell hung), so **I could not prove one defect line as the cause**. Below, each symptom has the concrete code-level cause I found, marked CONFIRM FIRST where it needs runtime proof, plus a fix that is safe either way.

Decisions (rationale): keep the mutual-consent design and privacy rules (no phone/email/whatsapp anywhere); no new npm packages; backend changes additive only; mode stays a UI filter only.

## 0. Step zero for the coder (reproduce before changing anything)
1. Re-run `%TEMP%\carpool-e2e\ui.js` (`Set-Location $env:TEMP\carpool-e2e; node ui.js *> ui-run.log`, read `ui-result.log`). It prints: Alice's inbox aria-label on Home, whether `/matches` shows "wants to join your ride" in Passenger Mode vs Driver Mode, the "Open chat" href after Accept, the URL after clicking it. Expected outcomes under hypotheses H1 to H3 below are stated in each section. If the run shows everything works, the user is on a stale build (H4): follow the stale-check in the verification doc.
2. Run backend `npm.cmd test` and frontend `npm.cmd test`/`lint`/`build` for a baseline (frontend baseline: 109 pass).

## (a) Join request does not appear on the receiver's side

Root cause (CONFIRM with ui.js step "A(/matches, passenger mode)"):
- `frontend/src/pages/Matches.jsx` ~line 83: `const matches = filterMatchesByMode(byTab, mode)`; `utils/matchInbox.js` `filterMatchesByMode` keeps only `m.role === 'DRIVER'` in Driver Mode. A join request is role DRIVER for the ride owner. `ModeContext` (`utils/mode.js`) defaults to `passenger` and is stored per browser, not per user, so the driver receiving a join request (and any second account on the same browser) is in Passenger Mode and the list is empty ("Offers from drivers and your join requests will show up here"). The only clue is a small hint button (`otherModeCount`), shown only on `/matches`.
- Option D made Home (`pages/Feed.jsx`) a feed with no pending indicator, and the `Active Rides` bottom-nav tab shows no badge, so nothing on the screens the user actually uses points at the pending request.

Minimal fix:
1. `Matches.jsx`: render incoming PENDING items from BOTH modes in a top "Needs your response" section regardless of mode (accept/decline work for either role, backend authorizes by role). Keep the mode filter for the rest. Keep the hint. Implement the selection as a pure helper `pendingIncoming(matches)` in `utils/matchInbox.js` and `splitInbox(matches, mode)` returning `{ needsResponse, rest }`.
2. `Feed.jsx`: add a small banner under the mode switcher when `useAlerts().count > 0`: "You have N new offers or requests" linking to `/matches` (use `formatBadgeCount`).
3. Nothing in the backend changes.

Regression test (new `frontend/tests/matchInbox.test.js` cases): a driver-role PENDING incoming match is in `needsResponse` when mode is `passenger` and when `driver`; a passenger-role one likewise; outgoing/accepted/declined are not; `rest` contains the mode-filtered remainder with no duplicates. Plus a source-wiring test (style of `tests/homeWiring.test.js`) asserting `Matches.jsx` imports `splitInbox` and `Feed.jsx` references `useAlerts`.

## (b) Notification counts/badges do not update

Findings (CONFIRM with ui.js "A(home) inbox aria-label" after the join request exists):
- `BottomNav.jsx` renders a badge only for the Chat tab from `useChatUnread().count`, which `ChatUnreadContext` sets from `unreadMessages` only (pending join requests are deliberately excluded, see `chatController.getUnreadCount`). A new join request therefore never shows on the mobile bottom nav at all; the only counter is the small inbox icon in `Navbar.jsx` (`useAlerts`).
- `AlertContext.jsx` polls every 45 s and on `visibilitychange`, but has no `focus` listener (ChatUnreadContext has one) and does not refresh on route change, so a second account/device can wait up to 45 s.
- `GET /api/matches/alerts/count` itself is correct (verified: 1 for the receiver, 0 for the sender, 1 for the passenger after accept, 0 after `seen`).

Minimal fix:
1. `BottomNav.jsx`: add the alert badge to the `Active Rides` tab using `useAlerts().count` (same markup/`formatBadgeCount`/aria-label pattern as Chat); desktop `Navbar.jsx` nav link for `active` the same. Pure helper `badgeFor(itemKey, { alerts, chatUnread })` in `utils/nav.js` returns the number for `active` (alerts), `chat` (chatUnread), else 0.
2. `AlertContext.jsx`: add `window.addEventListener('focus', tick)` (and remove it in cleanup) and lower `POLL_MS` to 20000 (visible tab only, as now). `ChatUnreadContext.jsx`: same interval for consistency (20000).
3. `Matches.jsx` `markMatchSeen` for PENDING incoming stays manual ("Mark as seen"); keep, but call `refresh()` after accept/decline (already done by `load()`).

Regression test: extend `tests/nav.test.js` with `badgeFor` table; source test asserting `BottomNav.jsx` imports `useAlerts` and `AlertContext.jsx` registers a `focus` listener.

## (c) Chat box does not open on accept

Findings (CONFIRM with ui.js "A after accept: Open chat href"):
- `Matches.jsx` `run()` for accept only sets a notice and calls `load()`. There is no navigation to the chat. The "Open chat" link uses `conversationForMatch(conversations, m.id)` where `conversations` comes from a non-awaited `getConversations().then(...)` inside `load()` (only when some match is ACCEPTED), and falls back to `/chat` (the list) when the lookup has not landed. The earlier accepted design (p4c plan item 8) was this link, not auto-open; the user now expects the chat to open on accept.
- Backend accept response (`matchController.acceptMatch` -> `viewById`) carries no conversation id (verified: conversation is created and listed correctly).

Minimal fix:
1. Backend (additive, privacy-safe): in `acceptMatch`, after `createChatForMatch`, include `conversationId: String(conv._id)` in the response body next to `data` (do not put it in `buildMatchView`). Capture the conversation returned by `chatHooks.createChatForMatch(claimed)` in a variable; keep the existing try/catch so a chat failure never rolls back the accept (field is omitted then). Add to `backend/tests/chat.test.js` or `requests-matches.test.js`: accept returns `conversationId` equal to the id in `GET /api/chat/conversations`; both participants can `GET /api/chat/conversations/:id`; no email/phone/whatsapp in the body.
2. Frontend: `services/api.js` unchanged. In `Matches.jsx` use `useNavigate`; after a successful `acceptMatch` response, `navigate('/chat/' + res.data.conversationId)`. If the field is missing, `await getConversations()` once, use `conversationForMatch(list, m.id)`, and navigate if found; otherwise stay and show "Accepted. Open it from Chat." Make `run` return the API response. Also make the "Open chat" link await the conversation list (set `conversations` before rendering links, fall back to `/chat` only if still missing).
3. Pure helper `chatTargetAfterAccept(response, conversations, matchId)` in `utils/matchInbox.js` returning `/chat/<id>` or null.

Regression tests: unit tests for `chatTargetAfterAccept` (uses `conversationId` when present; else lookup by matchId; else null); backend test above; source test asserting `Matches.jsx` calls `navigate(` in the accept path.

## (d) Stale deployment (H4), always check
`vite.config.js` uses `registerType: 'prompt'`: an installed PWA/older tab keeps the old bundle until "update" is accepted. If ui.js shows all of (a) to (c) work against the current source, the user needs the update prompt accepted or a hard reload, and the Vercel backend/frontend must be the latest deploy. Also verify `VITE_API_URL` points at the current backend. Do not change caching (`/api/` is already NetworkOnly).

## Tab order change (explicit user request)

Decisions: `feed` is Tab 1 and the default for both modes, `my` is Tab 2. Guests in Driver Mode default to Tab 1 (Passenger Requests) which already renders `LoginPrompt` via `sourceFor` (least surprising and consistent with "Tab 1 is the default"); Passenger guests keep the public Available Rides. Persisted preference keys are renamed to `_v2` so a stored value from the old order cannot override the new default; stored values are still validated against allowed ids.

1. `frontend/src/utils/homeTabs.js`:
   - `HOME_TAB_KEYS`: `carpool_home_tab_driver_v2`, `carpool_home_tab_passenger_v2`.
   - `HOME_TABS.driver = [{id:'feed',label:'Passenger Requests'},{id:'my',label:'My Rides'}]`; `HOME_TABS.passenger = [{id:'feed',label:'Available Rides'},{id:'my',label:'My Requests'}]`.
   - `defaultTab()` returns `'feed'` for every mode/auth state (keep the signature so `resolveTab`/callers don't change). Update the comment.
2. `frontend/src/pages/Feed.jsx`: only the comment about "fresh launch starts on My ..." changes; logic is driven by `resolveTab`.
3. Empty states/login prompts in `homeTabs.js` are keyed by tab id and stay correct.
4. Update `frontend/tests/homeTabs.test.js`: labels per mode in the new order (`tabsForMode('driver')[0].label === 'Passenger Requests'`, `[1] 'My Rides'`; passenger `'Available Rides'`, `'My Requests'`); default is `'feed'` for authenticated and guest in both modes; persistence keys `_v2` and still independent per mode; invalid/old values fall back to `'feed'`; `nextTabId` expectations (ArrowRight from index 0, Home/End) re-based on the new order. Update `frontend/tests/homeWiring.test.js` anywhere it assumes `'my'` is the default or the old key names.
5. Update `.agents/tasks/two-sided-carpooling-plan.md` progress note (one line) saying tabs are Feed-first.

## Order of work for the coder
1. Step zero (reproduce, section 0). 2. Tab order change + tests (smallest, isolated). 3. (c) backend `conversationId` + test, then frontend navigate + helper + tests. 4. (a) inbox split + Home banner + tests. 5. (b) nav badge + polling + tests. 6. Full verification: `npm.cmd test` and `npm.cmd run lint` and `npm.cmd run build` in `frontend`, `npm.cmd test` in `backend` (expect 137+ pass), re-run `e2e.js` (expect 33/33, extend with a `conversationId` assertion) and `ui.js`; confirm in ui.js that after Accept the URL becomes `/chat/<id>`, Alice's Home shows the banner and the Active Rides tab shows the badge. 7. No commit unless asked; clean temp processes.
