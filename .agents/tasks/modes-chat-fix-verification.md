# Verification: Option D two-tab Home + chat alignment

## Files
Created (frontend): `src/utils/homeTabs.js`, `src/components/{HomeTabs,LoginPrompt,DiscoveryFeed,MyRidesList,MyRequestsList,RequestCard,OfferPicker,MessageBubble}.jsx`, `tests/{homeTabs,homeWiring,chatBubble}.test.js`.
Modified (frontend): `src/pages/{Feed,MyRides,MyRequests,Requests,ChatThread}.jsx`, `src/components/RideCard.jsx` (optional `isOwn`), `src/services/api.js` (+`getMyRides`, `getRides`), `src/utils/chat.js` (+`isOwnMessage`, `bubbleView`).
Modified (backend): `tests/chat.test.js` only (one new test). No backend source change.
Modified (docs): `two-sided-carpooling-plan.md` progress line.
`Home.jsx` untouched. No existing test was changed.

## Commands and results
- `npm.cmd run lint` (frontend): 0 errors, 17 warnings (all pre-existing patterns, incl. set-state-in-effect on the two extracted list components, same as the former pages).
- `npm.cmd run build` (frontend): success (vite, 2017 modules, PWA generated).
- `npm.cmd test` (frontend, after build): 109 tests, 109 pass, 0 fail (33 new: chatBubble 9, homeTabs 9, homeWiring 7 plus existing).
- `npm.cmd test` (backend, jest --runInBand): 7 suites passed, 189 tests passed, 0 failed.

## Chat root cause (honest statement)
The code already branched on the server-computed `mine` boolean (no sender id on the wire, by privacy design). A static read found no wrong field or id type mismatch, and I could not reproduce "all left" without a browser. Likely causes: a stale installed PWA shell (`registerType: 'prompt'`) or a backend build without `mine`. Hardening done: `isOwnMessage` (boolean `mine` first, then String() id comparison, else not own), explicit `ml-auto`/`mr-auto` plus `w-full` rows, `bg-emerald-700` own bubble (AA contrast) vs `bg-slate-100` other, screen-reader cue, report only on other party's persisted messages. Backend contract test added (mine per participant, replay, exact key set, no email/phone/ids).

## NOT verified
- Real browser rendering at 390 px (no overflow, bubble alignment, tab bar layout, FAB/bottom-nav overlap).
- Keyboard and screen-reader behaviour of the tab control and the `sr-only` bubble cues.
- Live two-account end-to-end flow; deployment. Installed PWA users must accept the update prompt or reload; backend must be the current build so `mine` is returned.
- React components are covered by source-wiring tests only (no DOM test library in the repo).
