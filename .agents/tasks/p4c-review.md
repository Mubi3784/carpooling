# Mode switcher, chat UI, push opt-in and privacy cleanup (Phase 4 C + B3 frontend)

The frontend gains a Passenger/Driver mode switcher (UI filter only), a 4-item bottom nav (Home, Active Rides, Chat, Profile), mode-aware Active/Feed/Matches pages with a single "+" FAB, chat list/thread pages, a Profile page and a push opt-in card. AuthContext is reduced to `{ id, name, role }`, the WhatsApp button is gone from RideDetails, and the service worker loads a separate `push-handler.js` via `importScripts`. I judged this from the source and `p4c-verification.md` (lint 0 errors, build pass, frontend 78/78, backend 137/137) and did not re-run suites.

Watch for: no real-browser/device verification of 390px layout, FAB/nav overlap, or push delivery (confirmed gap, non-blocking); "Open chat" costs an extra `GET /chat/conversations` because the match payload carries no `conversationId` (confirmed, non-blocking); chat polling is inline in `ChatThread.jsx` and only covered by pure-function and wiring tests (likely, non-blocking).

**Verdict**: APPROVED

## High-level view

Mode is a React context persisted to `carpool_mode`, defaulting to Passenger, and only filters which buttons and inbox items appear. The switcher is a radiogroup with roving tabindex, arrow/Home/End keys, text labels plus a check mark. One `ModeFab` is used on Home (Feed) and `/active`; Matches filters by mode and hints at the other mode's pending items.

Navigation matches the spec: `NAV_ITEMS` has exactly four entries, protected tabs send guests to `/login`, Roads is out of the nav but `/road-status` stays routable and is linked from Profile. The chat badge polls `GET /api/chat/unread-count` every 45 s only while the tab is visible, plus on focus/visibility change.

Privacy holds: `toSafeUser` keeps only id, name, role. A grep of `frontend/src` finds no `user.phone`, `user.email`, `whatsappLink`, `.whatsapp` or `dangerouslySetInnerHTML`. Message text renders as a text node.

Push uses an explicit click gesture, fetches the key from `GET /api/push/public-key` (backend returns `{data:{key}}`, null when unconfigured, which the client handles as `server-not-configured`), and reports unsupported/iOS-needs-install states. The service worker keeps `/api/` NetworkOnly and precache intact, with push handling in a separate script.

<details>
<summary>Issues (3)</summary>

1. **No device verification** — 390px layout, FAB/bottom-nav/composer overlap, real push delivery and SW update flow are unverified (confirmed). Do a manual device pass before release.
2. **Extra request for Open chat** — `conversationId` is not in the match payload, so the client looks it up via `/chat/conversations` and falls back to `/chat` (confirmed). Consider adding `conversationId` to the match payload later.
3. **Chat polling not behavior-tested** — backoff, visibility pause and 404/410 stop live inline in `ChatThread.jsx` with only pure-helper tests (likely). Extract a hook if this regresses.

</details>

<details>
<summary>Details</summary>

## Open chat resolved client-side

The backend exposes `conversationId` only in the report record and conversation responses, not on matches. `Matches.jsx` calls `conversationForMatch(conversations, m.id)` against `GET /chat/conversations` and falls back to `/chat` if the conversation does not exist yet. This works, costs one extra call per Matches load, and the fallback is a soft failure rather than a broken link.

## Chat thread polling and report dialog

Polling logic (delay by idle time and visibility, error back-off, stop on 404/410 with end-of-chat message) is inline in `ChatThread.jsx`. Only the pure helpers and a source-wiring test cover it, so timing and visibility behavior rely on manual verification. The report dialog does implement focus-first-control, Tab trap, Escape and focus return (lines ~46-70), which contradicts the verification note that no focus trap exists; that is a documentation inaccuracy in the evidence file, not a code defect.

## Test coverage

New node:test files cover mode, nav, safeUser, chat, matchInbox, pushSupport and the built service worker. There are no DOM-render tests (no new packages allowed), so the switcher's keyboard handling and FAB placement are checked only through helpers and source assertions. Not tested: real rendering, keyboard/screen-reader use, push delivery, end-to-end accept to chat to report.

</details>

<details>
<summary>File map</summary>

Frontend only (see `git diff` and untracked files): `context/{ModeContext,ChatUnreadContext,AuthContext}`, `components/{ModeSwitcher,ModeFab,NotificationsCard,BottomNav,Navbar}`, `pages/{Active,Profile,ChatList,ChatThread,Feed,Matches,MyRides,MyRequests,OfferRide,RideDetails}`, `utils/{mode,nav,safeUser,chat,matchInbox,pushSupport}`, `lib/push.js`, `public/push-handler.js`, `vite.config.js` (one `importScripts` line), `services/api.js`, and tests under `frontend/tests/`.

</details>
