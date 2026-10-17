# Option D two-tab Home and chat bubble alignment

Feed.jsx is now a thin shell. It renders ModeSwitcher, an accessible HomeTabs tablist, one tabpanel and ModeFab. The panel content is picked by a pure `sourceFor(mode, tab, isAuthenticated)`. The lists were extracted into DiscoveryFeed, MyRidesList, MyRequestsList, RequestCard and LoginPrompt. Chat bubbles moved into MessageBubble, driven by `bubbleView` and `isOwnMessage` in `utils/chat.js`.

Watch for: the chat root cause was not reproduced (possible, see issue 1), and nothing was verified in a real browser at 390px (confirmed in the evidence note).

**Verdict**: APPROVED

## High-level view

The tab-to-endpoint mapping matches the spec. Driver: my-rides and requests. Passenger: requests/mine and rides. `sourceFor` returns 'login' for unauthenticated users on any non-public source, so a guest never sees a private list. Only passenger guests default to 'Available Rides'. The tabpanel is keyed by `${mode}-${tab}`, so a mode or tab change remounts the list and cannot leak the other mode's data.

Tab choice is kept per mode in sessionStorage, with separate keys per mode. A fresh launch lands on 'My ...'. Invalid stored values fall back to the default.

DiscoveryFeed keeps the date tabs, vehicle filter, P5 filter panel, nlpSearchParser keyword filter and the requestId out-of-order guard. It adds a Retry button on the error state and the offline notice, and a mode-aware empty-state CTA. No backend source changed.

For chat, the client already used a server-computed `mine` boolean, since the wire format carries no sender ids. The fix hardens that check. `isOwnMessage` uses `mine` first, then a String() id comparison, and otherwise treats the message as not own. Own bubbles are right-aligned with `ml-auto` on `bg-emerald-700` with white text. Other bubbles are left-aligned and neutral. Bubbles use `max-w-[80%]` and `overflow-wrap:anywhere`. Text renders as a plain React string with an sr-only sender cue. Report shows only on the other party's persisted messages. A backend contract test asserts `mine` per participant and that no email, phone or ids leak.

<details>
<summary>Issues (3)</summary>

1. **Chat root cause unconfirmed** (possible, non-blocking) — the coder could not reproduce "all left" and attributes it to a stale PWA shell or an old backend without `mine`. After deploy, confirm the backend returns `mine` and that PWA users accept the update prompt.
2. **No browser or DOM verification** (confirmed, non-blocking) — components are covered by source-wiring tests only. Manually check 390px overflow, tab keyboard navigation, the bottom-nav/FAB overlap and the sr-only cues.
3. **Tab arrow keys also bind ArrowUp/ArrowDown** (confirmed, minor) — `HomeTabs.jsx` onKeyDown calls preventDefault on vertical arrows, which blocks page scroll while a tab has focus. Harmless for a two-tab bar, but consider limiting it to Left/Right/Home/End.

</details>

<details>
<summary>Details</summary>

## Mode-scoped sources and guest handling

`homeTabs.js` holds the logic as pure functions, with 9 unit tests, and `homeWiring` has 7 source-wiring tests. The guest branch is encoded in `sourceFor`, with `loginPromptFor` supplying per-tab copy. No path shows a driver list under a passenger tab.

## Chat sender identification

No `dangerouslySetInnerHTML` is used in MessageBubble. Failed and sending states render on the own (right) side with Retry. The own-bubble contrast of white on emerald-700 is about 5.5:1, which passes AA. The wider fix works only if the server sends `mine`. Without it, `isOwnMessage` falls back to an id comparison, then to "not own", which fails closed to left alignment. That is the symptom the user reported, so a backend without `mine` would reproduce it.

## Scope

No Option 1 relabel or intro note was found in the changed files. The seat-stepper fix is untouched. `Home.jsx` is untouched, per the evidence note. The working tree also holds many earlier-phase changes (backend controllers, models, tests), which predate this task. The evidence note lists only the files for this task. No backend source change was claimed for this task.

## Evidence

The evidence note records:
- Frontend lint: 0 errors, 17 warnings.
- Frontend build: passing.
- Frontend tests: 109 of 109 passing, including 33 new.
- Backend tests: 189 of 189 passing, including one new chat contract test.

I did not re-run the suites, per instructions.

</details>

<details>
<summary>File map</summary>

- `Feed.jsx`: thin shell with tabs and panel
- `HomeTabs.jsx`: accessible tablist
- `DiscoveryFeed.jsx`: shared rides/requests feed with filters
- `MyRidesList.jsx`, `MyRequestsList.jsx`, `RequestCard.jsx`, `LoginPrompt.jsx`, `OfferPicker.jsx`: extracted components
- `utils/homeTabs.js`: tab and source logic
- `MessageBubble.jsx`, `utils/chat.js`, `ChatThread.jsx`: chat alignment
- `backend/tests/chat.test.js`: `mine` contract test

</details>
