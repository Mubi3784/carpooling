# Home notification banner and WhatsApp ride/request sharing

Adds a Home banner that drives the existing Web Push flow from a user tap, a shared `usePushNotifications` hook (Profile card refactored onto it), WhatsApp share buttons for rides and requests with whitelisted-field templates, a protected `/requests/:id` page, post-auth redirect-back with open-redirect guarding, and backend hardening (`Ride.whatsappNumber` `select:false`, 404 on malformed ObjectIds). The coder's verification file records backend jest 196/196, frontend tests 132/132, lint exit 0 and a passing build; I did not re-run them. Visual and live-server checks were not performed (stated in the evidence).

Watch for: stale `postAuthRedirect` in sessionStorage can send a later, unrelated login to an old target (possible, minor, non-blocking). No visual or on-device PWA check was done (confirmed from evidence).

**Verdict**: APPROVED

## High-level view

The banner and Profile card share one hook. Permission is requested only inside the button's click handler. On mount the hook reads the current state, and a silent once-per-session resync runs only when a subscription already exists. The banner is rendered for authenticated users only.

Sharing is built from a whitelist of listing fields (locations, date, time, vehicle, seats), a base URL from `VITE_APP_BASE_URL` with an origin fallback, and a `wa.me/?text=` URL. Share links contain only `/rides/:id` or `/requests/:id`. The request route is behind `ProtectedRoute`, which passes `state.from`. Login and Register read it, mirror a sanitised copy to sessionStorage, and consume it after success.

Backend: `whatsappNumber` is `select:false`. The only writer is `createRide`, and every read path already excludes it or never reads it. Malformed IDs return 404 on ride get/update/delete, and the request loader already guards.

<details>
<summary>Issues (2)</summary>

1. **Stale postAuthRedirect (possible)** — Login/Register save to sessionStorage but never clear it when abandoned, so a later plain login can land on the old listing. Consider clearing on mount when no `from` is present, or accept as-is (same-origin safe path, same tab session).
2. **No visual/PWA verification (confirmed gap)** — 390px and desktop checks were not run; do the manual steps in plan section 9 before release.

</details>

<details>
<summary>Details</summary>

## Redirect-back and open-redirect safety

`safeRedirectPath` accepts a string or a location object. It rejects anything not starting with `/`, anything starting with `//`, backslashes and control characters, and `/login` or `/register` including with query or hash. Absolute and cross-origin URLs fail the leading-slash test. The sessionStorage copy is re-validated on read, and `resolvePostAuthTarget` always consumes (clears) it, preferring router state, then the saved value, then `/`. Login and Register both use it. The Login/Register cross-links forward `location.state`, so the target survives that hop. A stale saved target is the one residual (see Issues item 1). A saved value is always a validated same-origin path, so it is not an open redirect.

## Notification prompt is tap-only

`enablePush` is reachable only through `turnOn`, which the banner wires to the button's onClick. The mount path calls `currentPushState` (read-only) and, only when already `on`, resyncs an existing subscription without asking permission. The banner is gated on `isAuthenticated && !authLoading`. The Profile card keeps the same hook state machine, the same messages and the same turnOn/turnOff branches as the removed inline code (diff is a straight extraction), so its behavior is unchanged.

## Share buttons and card nesting

RideCard now wraps a `Link` and a sibling share button inside a `div`, so the button is not nested in the anchor. The button also calls preventDefault and stopPropagation. The button is shown only for ACTIVE rides and requests. Touch targets are 44px.

## Share text and PII

The templates were checked at the code-point level: 🚗, 📍, 📅, 🕒, 🚘, 💺 for rides, and 🙋, 📍, 📅, 🕒, 🏍️ (with U+FE0F) or 🚘 for requests, using the plan's field order, labels, `\n\n` separators and trailing link. Only whitelisted fields are read, and values are control-char stripped and length-capped. Nothing from phone, email, notes, token or driver/passenger objects is used. Links carry only an id.

## whatsappNumber exposure

Model is `select:false`. Non-test occurrences are: create (writes), `.select('-whatsappNumber')` on reads (harmless redundancy), and no `+whatsappNumber` anywhere. No path returns it to anyone. Hardening tests assert absence in list, my-rides and detail responses.

</details>

<details>
<summary>File map</summary>

Backend: `models/Ride.js` (select:false), `controllers/rideController.js` (404 on bad id), `tests/hardening.test.js`. Frontend: `hooks/usePushNotifications.js`, `NotificationBanner.jsx`, `NotificationsCard.jsx` (refactor), `utils/pushSupport.js` (banner view), `utils/nav.js` (redirect helpers), `utils/share.js`, `ShareWhatsAppButton.jsx`, `RideCard.jsx`, `RequestCard.jsx`, `MyRidesList.jsx`, `MyRequestsList.jsx`, `RideDetails.jsx`, `RequestDetails.jsx`, `ListingUnavailable.jsx`, `Login.jsx`, `Register.jsx`, `App.jsx`, `Feed.jsx`, `services/api.js`, `.env.example`, and tests. Full diff: `git diff` plus untracked files.

</details>
