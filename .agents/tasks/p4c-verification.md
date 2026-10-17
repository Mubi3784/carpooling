# P4 C + B3 verification (frontend sub-phase)

All commands were run from PowerShell with output redirected to a log file, then read back. No browser automation. No git commit. No new npm packages. No real VAPID keys written anywhere.

## GATE 0: backend baseline (before frontend work)
- `Set-Location backend; npm.cmd test`: Test Suites 5 passed / 5 total, Tests 137 passed / 137 total (chat, requests-matches, push, api, seat-race). No backend fix was needed.
- Frontend baseline numbers were not captured before editing (the first frontend run happened after the changes). Pre-existing frontend test files: 7 (impactCalculator, installPlatform, networkError, nlpSearchParser, requests, scheduling, vehicle).

## Final runs (after all changes)
- `frontend: npm.cmd run lint` (oxlint): 0 errors, 20 warnings. Warnings are mostly pre-existing patterns (react immutability/set-state-in-effect, unused imports in untouched code). New-file warnings: `ChatThread.jsx` (schedule self-reference, `Date.now` in handlers), `ChatList.jsx` (set-state-in-effect, same pattern as existing pages), `Matches.jsx` (set-state-in-effect, pre-existing pattern).
- `frontend: npm.cmd run build`: PASS (vite 8, 2004 modules, PWA generateSW, 20 precache entries; chunk-size warning is pre-existing).
- `frontend: npm.cmd test` (run after build so the dist assertions are active): tests 78, pass 78, fail 0, skipped 0. (A first run before the rebuild failed 1 dist assertion because dist was stale; it passed after the build.)
- `backend: npm.cmd test` re-run at the end: Test Suites 5 passed / 5, Tests 137 passed / 137.

## Service worker confirmation (read from `frontend\dist\sw.js`)
- Contains `importScripts("push-handler.js")` inside the generated worker; `dist\push-handler.js` exists (also precached).
- `push-handler.js` registers `push` (generic notification, no message text) and `notificationclick` (focus/open the payload URL, same-origin guard: must start with `/` and not `//`). It has no `fetch` handler.
- `/api/` is still `NetworkOnly` (`pathname.startsWith("/api/")` and the API-origin RegExp), `NavigationRoute` to `/index.html` with `/^\/api\//` denylist, and `precacheAndRoute` are intact.
- Approach: `generateSW` + `workbox.importScripts` (one line added in `vite.config.js`), so the existing caching and update flow were not rewritten.

## What was implemented
- Pure modules: `utils/{mode,nav,safeUser,chat,matchInbox,pushSupport}.js` with tests `tests/{mode,nav,safeUser,chat,matchInbox,pushSupport,sw-push}.test.js`.
- API client additions: profile, chat, push (`DELETE /push/subscribe` with a body for unsubscribe).
- Contexts: `ModeContext` (localStorage `carpool_mode`, default Passenger, UI filter only), `ChatUnreadContext` (polls `unreadMessages` every 45 s only while visible), `AuthContext` now stores only `{ id, name, role }` via `toSafeUser` and removes a stale `carpool_user` key.
- Components: `ModeSwitcher` (radiogroup, roving tabindex, arrow/Home/End, text labels plus check mark), `ModeFab` (single mode-aware "+" with visible label, sits above the bottom nav), `NotificationsCard`, new `BottomNav` (exactly Home, Active Rides, Chat with unread badge, Profile; no Roads), simplified `Navbar` (same 4 destinations, Road Status link kept for desktop, inbox icon kept, duplicate role links removed).
- Pages: `Active` (mode aware: Passenger shows My Requests + Find Rides + offers; Driver shows My Rides + Browse Passenger Requests + join requests), `Profile` (details in local state only, phone edit via PATCH, logout, Road Status link, notifications), `ChatList`, `ChatThread`; `Feed` (mode switcher, driver shortcuts, removed header Offer button, FAB), `Matches` (mode filter, other-mode hint with switch button, Open chat via `conversationForMatch`, updated copy), `MyRequests`/`MyRides` (`embedded` prop, header action buttons removed because the FAB replaces them).
- Routes added in `App.jsx`: `/active`, `/chat`, `/chat/:id`, `/profile` (protected); `/road-status` stays public and is linked from Profile.
- Privacy cleanup: RideDetails WhatsApp button removed (guests see "Log in to Request a Seat"), notice copy updated; OfferRide WhatsApp field is optional and prefilled from `GET /auth/profile` into local form state; Register phone label "Phone Number (private)"; Home and MyRides copy updated.
- Chat: message text rendered only as `{m.body}` text (no HTML injection APIs, asserted by a test that scans `ChatThread.jsx` and `ChatList.jsx`); Sending/Sent/Failed + Retry reusing the same `clientMessageId`; polling 4 s while visible, 12 s after 2 minutes idle, paused when hidden, immediate refresh on focus/visibilitychange, back-off on errors, stops on 404/410 and shows "This chat has ended because the ride time has passed" before navigating back after 3 s; 500-char counter; persistent safety note; per-message Report with reason picker and confirmation.
- Docs: `two-sided-carpooling-plan.md` updated (P4 DONE, P6 reduced, DEPLOY STEPS (P4) section).

## Decisions and deviations to note
- "Open chat" backend shape check: `conversationId` is NOT in the match payload (grep of the backend found no such field). The button resolves the chat client-side with `GET /chat/conversations` and `matchId`; it falls back to `/chat` if the conversation is not found yet.
- The chat polling logic is inline in `ChatThread.jsx` (using the pure `pollDelay`/`classifyChatError`/`mergeMessages`) rather than a separate hook file. Hook timing behaviour is covered by pure-function tests and a source-wiring test only.
- Feed keeps the public ride list visible in both modes; only the action buttons change.
- Matches fetches all matches once and filters tab and mode on the client (needed to count pending items in the other mode).
- Tests are pure node:test files; no React/DOM rendering tests exist (no new packages allowed). "Segmented control behaviour", "FAB label" and "bottom nav 4 items" are verified through the pure helpers plus source checks.

## NOT verified
- Real browser rendering at 390px width, horizontal overflow, and FAB / bottom-nav / composer overlap (visual).
- Keyboard and screen-reader behaviour of the mode switcher, chat log live region, and report dialog (the report dialog in ChatThread.jsx implements focus-first-control, Tab trap, Escape and focus return, but this is untested in a browser).
- Real Web Push delivery on Android and iPhone, permission prompt flow, notification click navigation, and the VAPID public-key fetch against a configured server.
- Service worker update flow on installed PWAs, and that `importScripts` loads correctly in a real browser (only the generated file was inspected).
- Polling timing and visibility pause behaviour in a real tab.
- Live end-to-end flow against a real backend (accept -> Open chat -> send -> report).
