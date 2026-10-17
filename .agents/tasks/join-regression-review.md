# Join/Offer regression fix and Feed-first tab order

The change makes the Join/Offer receiver flow visible regardless of the browser's Passenger/Driver mode. It adds a badge on the Active Rides nav item, returns `conversationId` from accept so the UI can open the chat, and reorders the Home tabs to Feed first with `_v2` storage keys. Mutual consent and privacy rules are untouched.

Watch for: no browser-level run was done, so the UI root causes for (a) to (c) are inferred from code and API e2e, not reproduced (likely). The "fails before the fix" claim rests on missing exports, not on a run against old code (confirmed, non-blocking).

**Verdict**: APPROVED

## High-level view

The backend already worked end to end (33/33, then 37/37 e2e). The coder correctly located the defects on the frontend. A join request is role DRIVER, so a receiver in the default Passenger Mode filtered it out. `splitInbox` now always surfaces incoming PENDING items from both modes in a "needs response" bucket, and Home shows a banner when the alert count is above zero.

Badges: pending requests never appeared on the bottom nav. `badgeFor` now maps alerts to the `active` item and chat unread to `chat` in both BottomNav and Navbar. Alert and chat polling drop to 20 s and gain a `focus` listener.

Chat on accept: `acceptMatch` now returns an additive top-level `conversationId` (omitted if chat creation fails, so accept is never rolled back). `Matches.jsx` navigates to `/chat/<id>`, falling back to a conversation lookup by match id.

Tabs: `HOME_TABS` and `defaultTab` match the requested order for both modes. Guests default to Tab 1, and stored values are validated by `isValidTab`.

<details>
<summary>Issues (3)</summary>

1. **No UI-level run (possible)**: the `ui.js` browser smoke was never completed. Run it or a manual check once: receiver badge, banner, accept lands on `/chat/<id>`.
2. **Stale PWA bundle (possible)**: `registerType: 'prompt'` means the user may still run the old bundle. Tell the user to accept the update or hard reload, and confirm the deployed backend is current.
3. **Stray artifacts (confirmed)**: `.agents/tasks/*.log` and `*.txt` files are untracked temp output. Do not commit them.

</details>

<details>
<summary>Details</summary>

## Inbox visibility and mode filter

`splitInbox(matches, mode)` returns `needsResponse` (all incoming PENDING, either role) and `rest` (the mode-filtered remainder with those ids removed). That fixes the root cause I can verify in code: the mode filter hid driver-role requests from a user in Passenger Mode. `Matches.jsx` calls it at line 75 and `Feed.jsx` reads `useAlerts().count`. `matchInbox.test.js` covers the helper. A source-wiring check that Feed renders the banner was not confirmed by me.

## Accept opens the chat

Backend: `conversationId` is added in `acceptMatch` outside `buildMatchView`, so the match payload shape is unchanged. The new test in `chat.test.js` checks that the id appears in the conversation list, that a party can fetch it, that an outsider is rejected, and that no contact data is present. The e2e run recorded the same for Flow A and Flow B. Frontend: `chatTargetAfterAccept` prefers the response id, then a lookup, then null, which keeps the user on the page with a notice.

## Badge and polling

`badgeFor` is unit tested in `nav.test.js`. Both contexts register `focus`. Polling at 20 s per context doubles the request rate against two endpoints, which is acceptable at this scale.

## Tab order

`homeTabs.js` is correct against the request. Old stored keys are ignored via the `_v2` rename. Tests are in `homeTabs.test.js` (113/113 frontend pass).

## Evidence quality

The coder recorded fresh results after implementation: frontend 113/113, lint exit 0, build exit 0, backend 7 suites and 190 tests passing, e2e 37/37. I did not re-run any of them. I spot-checked the source for `conversationId`, `navigate`, `badgeFor`, `focus` and the `_v2` keys. No unrelated refactors were found in the touched feature files. The git working tree also contains many earlier-phase changes (rideController, Ride model and others) that are outside this plan and out of scope for this review.

</details>

<details>
<summary>File map</summary>

- backend/controllers/matchController.js: `conversationId` on accept
- backend/tests/chat.test.js: accept returns `conversationId`
- frontend/src/utils/matchInbox.js: `pendingIncoming`, `splitInbox`, `chatTargetAfterAccept`
- frontend/src/utils/homeTabs.js: tab order, default, `_v2` keys
- frontend/src/utils/nav.js: `badgeFor`
- frontend/src/pages/Matches.jsx: split inbox, navigate on accept
- frontend/src/pages/Feed.jsx: alert banner
- frontend/src/components/BottomNav.jsx, Navbar.jsx: alert badge on Active
- frontend/src/context/AlertContext.jsx, ChatUnreadContext.jsx: 20 s polling, focus listener
- frontend/tests: homeTabs, matchInbox, nav

Full diff: `git diff` plus untracked files in the working tree.

</details>
