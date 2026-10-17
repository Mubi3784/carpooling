# Join/Offer regression: reproduction evidence

Date of run: 2026-10-18. Nothing in the project was modified. All scripts live in `%TEMP%\carpool-e2e\` (`e2e.js`, `ui.js`). No `.env` value was read or printed, no production data touched, no commit, no new packages.

## 1. API end-to-end on throwaway in-memory MongoDB (real Express app via supertest)

Script: `%TEMP%\carpool-e2e\e2e.js`. Log: `run5.log`. Result: **33 passed, 0 failed**.

Flow B (passenger Bob asks to join driver Alice's ride) passed:
- Bob sees Alice's ride in `GET /api/rides`; `POST /api/matches` returns 201.
- Alice's `GET /api/matches` lists it: `role=DRIVER, direction=incoming, status=PENDING, canAccept=true, unread=true`; `?box=incoming` count 1.
- Alice `GET /api/matches/alerts/count` = 1, Bob = 0. Alice `GET /api/chat/unread-count` = `{pendingMatches:1, unreadMessages:0}`.
- Alice accepts: 200 ACCEPTED, ride seats 3 -> 2, a conversation exists and `GET /api/chat/conversations` lists it for both sides (same id, `matchId` equals the match id).
- Bob's alerts/count becomes 1 after accept, 0 after `POST /:id/seen`.
- Bob sends a chat message (`mine:true`); Alice `unreadMessages` = 1, reads it (`mine:false`), then 0.

Flow A (Alice offers her ride on Bob's request) passed: request listed in `GET /api/requests`, `rides-for-offer` lists the ride, offer 201, Bob's inbox shows `PASSENGER/incoming/canAccept`, Bob alerts=1 and pendingMatches=1, Bob accepts, seats 3 -> 2, conversation listed for both, Alice alerts=1.

Privacy check: no email/phone/whatsapp key or value in the `/api/matches` and `/api/chat/conversations` payloads.

Conclusion: **the backend Offer/Join -> accept -> conversation -> counters flow works end to end today.** The regression is not in matchController, matchService, chatHooks or chatController. (Side note: the first runs failed only because my script did not connect mongoose before inserting; script bug, not an app bug.)

## 2. Existing suites

- Frontend `npm.cmd test` (run now): **109 pass, 0 fail** (`node --test tests/*.test.js`). All tests are pure-helper or source-text tests; none render a component, so none can catch wiring regressions.
- Frontend `npm.cmd run lint` (oxlint): 0 errors, warnings only (set-state-in-effect in Matches/MyRidesList/MyRequestsList/ChatList, ChatThread `schedule` self-reference and `Date.now` purity, unused imports in Home/OfferRide).
- Backend `npm.cmd test` (jest --runInBand): not re-run in this step. Last recorded result (`.agents/tasks/b2-run.txt`): 5 suites, 137 tests passed. The coder must re-run it.

## 3. UI smoke (Edge + playwright-core) - NOT COMPLETED

`%TEMP%\carpool-e2e\ui.js` was written to boot in-memory Mongo + Express on :5000 + vite on :5173 and drive Edge for: Bob requests to join; Alice (default stored mode = passenger) checks the nav badge and `/matches`; switch to Driver Mode; Accept; click "Open chat". The first attempt failed before launching (script file not yet written when invoked). On the second attempt the shell tool stopped returning output and no log files appeared, so no UI result exists. **Every frontend finding below is therefore code-reading only and is marked "needs verification during implementation".** The coder should re-run `ui.js` (see plan section 6) first; its log lines are written to `%TEMP%\carpool-e2e\ui-result.log`. Kill any stray `node`/`msedge` processes it leaves (ports 5000/5173).

## 4. What the frontend code reading showed (unproven at runtime)

- `main.jsx`: providers wrap the app (Auth > Alert > ChatUnread > Mode). `Navbar.jsx` reads `useAlerts()` (inbox icon -> `/matches`), `BottomNav.jsx` reads only `useChatUnread().unreadMessages`.
- `Matches.jsx` filters by mode (`filterMatchesByMode`, role DRIVER in Driver Mode). Mode is stored per browser (`carpool_mode`), default `passenger`, not per user.
- `Feed.jsx` (Option D) shows no pending/inbox indicator. The inbox lives only in `/matches` and `/active`.
- Accept in `Matches.jsx` (`run(m, acceptMatch, ...)`) never navigates; "Open chat" shows after `load()`, using a non-awaited `getConversations()` and falls back to `/chat` (the list, not the thread).
- `vite.config.js`: `registerType: 'prompt'`; `/api/` is NetworkOnly (good), but the app shell/JS is precached and the old bundle keeps running until the user accepts the update toast.

## 4b. Coder iteration: what was run (shell unreliable; read carefully)

Implemented: backend `conversationId` on accept; Matches.jsx splitInbox + navigate to chat + refresh after actions; Feed.jsx banner; `badgeFor` on BottomNav/Navbar; AlertContext focus listener and 20 s polling (ChatUnread too); tabs reordered (feed first, default feed, `_v2` keys). Tests added/updated: frontend `homeTabs`, `matchInbox`, `nav`; backend `chat.test.js` (accept returns `conversationId`).

Evidence actually obtained:
- Backend `npm.cmd test` (jest --runInBand) output in `.agents/tasks/be.log`: PASS for `chat.test.js` (includes the new conversationId test), `requests-matches.test.js`, `matching-endpoints.test.js`, `push.test.js`, `seat-race.test.js` (its console.error "boom" is an expected mocked failure). The final summary line (suite/test totals) was NOT seen; the run had not finished writing when the shell stalled.
- Frontend `npm.cmd test`: launched, but no `fe.log` was produced. **UNVERIFIED.**
- Frontend lint, build, in-memory e2e (Flow A/B), `ui.js`: **NOT RUN.**
- "Fails before the fix" was NOT demonstrated (no runs against the old code). `homeWiring.test.js` was not checked for old-default assumptions.
- Process cleanup listing (`Get-CimInstance`) returned nothing, so stray node/mongod processes were not checked.

The reviewer must run: frontend `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, backend `npm.cmd test` totals, and e2e.js/ui.js.

## 5. How to tell a stale frontend/backend mismatch

- Browser console: `localStorage.getItem('carpool_mode')`; DevTools > Application > Service Workers shows a "waiting" worker when an update is pending; hard reload or "Unregister" then reload.
- DevTools > Network on `/matches`: `GET /api/matches` and `GET /api/matches/alerts/count` should be 200 and return the new item. If these return the item but the UI is empty, it is a mode filter/UI problem; if they do not, the user is hitting a different/old backend (check `VITE_API_URL` target and that the Vercel backend deployment is the latest).

## 6. Iteration 2: verification actually run (after implementation)

All runs on the modified code; logs read back from temp files. No .env read, no production data, no commit, no new packages.

- Frontend `npm.cmd test` (node --test): tests 113, pass 113, fail 0 (was 109 before the new cases).
- Frontend `npm.cmd run lint` (oxlint): exit 0, warnings only (set-state-in-effect, unused icon imports, etc.; none are errors, same classes as baseline).
- Frontend `npm.cmd run build` (vite): exit 0, 2017 modules, PWA sw.js generated (20 precache entries).
- Backend `npm.cmd test` (jest --runInBand): Test Suites 7 passed / 7; Tests 190 passed / 190 (includes chat.test.js accept -> conversationId test). The "boom" console.error in seat-race is an expected mocked failure.
- In-memory e2e (`%TEMP%\carpool-e2e\e2e.js`, real Express app + mongodb-memory-server, run6.log): 37 passed, 0 failed. New assertions vs the 33-run: accept response exposes `conversationId` in Flow A and Flow B; it equals the id in `GET /api/chat/conversations`; accept response body has no email/phone/whatsapp; counters (alerts/count, pendingMatches, unreadMessages) and chat send/unread all pass; privacy check on matches and conversations payloads passes.
- homeWiring.test.js checked: it contains no assumption of `'my'` as default and no storage-key names (it only checks Feed orchestration, accessible tablist, shared components); it passes unchanged. Tab order/default/`_v2` keys are asserted in homeTabs.test.js.

Fails-before-the-fix: the new frontend helpers (`splitInbox`, `chatTargetAfterAccept`, `badgeFor`) and the `_v2`/Feed-first tab config did not exist before, and these files are untracked in git so there is no old revision to run against; the tests import those helpers/ids, so they cannot pass against the old code (missing exports / old tab labels, default 'my', old keys). The backend conversationId test fails against the old acceptMatch because the field was absent from the response (the old e2e response had only `data`).

Not done: the browser UI smoke (`ui.js`) was not re-run (shell unreliable; no browser automation per the brief). Evidence for (a)(b)(c) at the UI level is therefore the API e2e plus the helper/source-wiring tests (Matches imports splitInbox and calls navigate on accept, BottomNav uses badgeFor/useAlerts, AlertContext registers focus).
