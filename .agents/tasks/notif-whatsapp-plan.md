# Implementation Plan Report: Home Notification Banner + WhatsApp Sharing

Status: READ-ONLY investigation. No source files were changed. Awaiting your approval before any edits.
Repo root: `d:\Mubashir\carpooling\carpooling` (backend `\backend`, frontend `\frontend`). Secret values were not read or echoed; env var names only.

## 1. Summary

- The Web Push stack is already complete and reusable. Frontend glue is `frontend/src/lib/push.js` (`currentPushState`, `enablePush`, `disablePush`). Backend is `backend/utils/push.js`, `backend/controllers/pushController.js` and `/api/push/*`. The service worker already imports `frontend/public/push-handler.js`. The only UI today is `NotificationsCard.jsx` on the Profile page. Feature 1 is therefore mostly UI: extract the card's logic into a shared hook and add a Home banner. No backend or service worker engine changes are needed.
- Push payloads are already generic. `backend/utils/push.js` lines 12-16 define `PAYLOADS` as "New message received", "New ride request" and "Ride request update". No names, places or message text.
- `/rides/:id` already exists, is public, and `GET /api/rides/:id` does not leak phone numbers. `/requests/:id` does NOT exist (only `/requests/:id/matches`, protected). `GET /api/requests/:id` exists, is protected and masks the passenger to a first name. Feature 2 needs one new frontend route and page, but no new backend endpoint.
- Auth fallback is half-built. `ProtectedRoute.jsx` passes `state.from` to `/login`, but `Login.jsx` line 22 and `Register.jsx` line 40 always `navigate("/")`. Both need to honor the saved route.
- Vercel SPA rewrites already work (`frontend/vercel.json`: `/(.*)` -> `/index.html`), and the service worker uses `navigateFallback`, so deep links will not 404.
- Main gaps: no `/requests/:id` route, no post-login redirect, no share utility, no `VITE_APP_BASE_URL`, and a RideCard layout issue (the whole card is a `<Link>`, so a nested button needs care).

## 2. Evidence (file/symbol citations)

### Push / notifications (existing)
- `frontend/src/lib/push.js`
  - `getPushSupport()` checks `serviceWorker`, `PushManager`, `Notification`, and iOS-not-standalone (UA test plus `display-mode: standalone` or `navigator.standalone`).
  - `currentPushState()` returns `'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'`. It uses `navigator.serviceWorker.ready` and `pushManager.getSubscription()`.
  - `enablePush()` calls `Notification.requestPermission()`, then `getPushPublicKey()` (`GET /api/push/public-key`), `pushManager.subscribe({userVisibleOnly:true, applicationServerKey})`, then `pushSubscribe()` (`POST /api/push/subscribe`).
  - `disablePush()` calls `DELETE /api/push/subscribe`.
- `frontend/src/utils/pushSupport.js`: `pushSupportState`, `urlBase64ToUint8Array`, `subscriptionToPayload`. Tests in `frontend/tests/pushSupport.test.js` and `sw-push.test.js`.
- `frontend/src/components/NotificationsCard.jsx`: holds the state machine and messages inline (lines 5-9 messages, 11-60 logic). Rendered at `Profile.jsx` line 104.
- `frontend/src/services/api.js` lines 98-101: `getPushPublicKey`, `pushSubscribe`, `pushUnsubscribe`.
- `backend/routes/pushRoutes.js`: all routes behind `protect` (login required): `GET /public-key`, `POST /subscribe`, `DELETE /subscribe`.
- `backend/controllers/pushController.js`:
  - `getPublicKey` returns `null` unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are all set.
  - `subscribe` is an upsert on `endpoint`, reassigns it to the current user, caps 5 per user, and refreshes `expiresAt` by 90 days. A silent re-sync on Home is therefore safe and idempotent.
- `frontend/public/push-handler.js`: `push` and `notificationclick` handlers. Only uses `payload.title`, `payload.body` and `payload.data.url`, validated to a same-origin path. It is loaded via `workbox.importScripts` in `frontend/vite.config.js`.
- `frontend/vite.config.js`: VitePWA with `registerType: 'prompt'`, `injectRegister: false`, `navigateFallback: '/index.html'`, and `/api/` as NetworkOnly. Manifest `start_url: '/'`, `display: 'standalone'`, theme `#059669`.

### Home page
- `frontend/src/pages/Feed.jsx` is the Home page (route `/`). Order is header, `ModeSwitcher`, alert link, `HomeTabs`, `InstallSection`, tab panel, `ModeFab`. Mode comes from `useMode()` (`ModeContext`), tabs from `utils/homeTabs.js`. `frontend/tests/homeWiring.test.js` regex-checks Feed for named components, so keep those intact.
- Style tokens: emerald-600 primary, slate neutrals, `rounded-2xl border border-slate-200 bg-white`, `min-h-[44px]` buttons, sky-50 info banners (`Feed.jsx` alert link) and emerald-50 for `InstallSection`.

### Routing / auth
- `frontend/src/App.jsx`: public `/`, `/rides/:id`, `/road-status`, `/login`, `/register`. Everything else is under `ProtectedRoute`. No `/requests/:id`. `/requests` (list) is protected.
- `ProtectedRoute.jsx` line 18: `<Navigate to="/login" state={{ from: location }} replace />`.
- `Login.jsx` line 22 and `Register.jsx` line 40: `navigate("/")` (ignores `from`). Login links to `/register` and Register to `/login` without forwarding state. `RideDetails.jsx` guest CTA is `<Link to="/login">` with no state. `LoginPrompt.jsx` links to `/login` and `/register` too.
- `AuthContext.jsx`: `login`, `register`, `logout`, `isAuthenticated`, `loading`.

### Ride / request data and privacy
- `backend/routes/rideRoutes.js`: `GET /:id` uses `optionalAuth`, so it is public.
- `rideController.getRideById` (line ~425): `.select('-whatsappNumber')`, returns driver `{id, name}` only, 404 if missing or `expiresAt <= now`. The `Ride` model stores `whatsappNumber` (line 60), but every read path strips it (lines 387, 429, 478, 539-540).
- `backend/routes/requestRoutes.js` line 22: `router.use(protect)`, so every request route requires login. `GET /:id` is `getRequestById` (`requestController.js` line 377). Non-owners get a view only if ACTIVE and not expired, otherwise 404. The owner gets `ownerView`. `browseView` (line 60) returns the passenger as first name only, with no phone or email.
- `RideRequest` has `requestDate`, `departureTime`, `vehiclePreference` (`CAR` or `BIKE`), `passengerCount`, `status` ACTIVE/MATCHED/CANCELLED, and `expiresAt`. EXPIRED is derived.
- Phone is stored on `User.phone` and is returned only by `GET /api/auth/profile` to the user themselves (`authController.profileView`, line 154). Good.
- Where cards render: `RideCard.jsx` (public feed, whole card is `<Link to=/rides/:id>`), `RequestCard.jsx` (others' requests in `DiscoveryFeed` and `Requests.jsx`; `<li>`), `MyRidesList.jsx` (driver's own rides, `<li>` line 196), `MyRequestsList.jsx` (passenger's own requests, `<li>` line 115). The discovery feed excludes your own requests (`requestController` `passenger: { $ne: req.user._id }`), so the share button for requests belongs on `MyRequestsList` (owner) and the new detail page. The ride share button belongs on `MyRidesList` (owner), `RideDetails` and `RideCard`.

### Env / deploy
- `frontend/.env` keys: `VITE_API_URL` (only). Used in `services/api.js` `getBaseURL` and `vite.config.js`.
- `backend/.env` keys: `MONGO_URI`, `JWT_SECRET`, `PORT`, `CLIENT_URL`, `ADMIN_EMAIL`, `DNS_SERVERS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. `backend/.env.example` lists the three VAPID keys (optional).
- `backend/vercel.json`: serverless API with a daily cron. `frontend/vercel.json`: SPA rewrite plus no-cache headers for `sw.js`, `registerSW.js`, `manifest.webmanifest`.
- CORS (`backend/server.js` lines 14-26): localhost, LAN, `*.vercel.app`, or `CLIENT_URL`.
- Scripts: frontend `npm test` (= `node --test tests/*.test.js`), `npm run build`, `npm run lint` (oxlint). Backend `npm test` (jest --runInBand).

## 3. Files to modify / create

### Feature 1: Notification banner
Create:
- `frontend/src/hooks/usePushNotifications.js` (new shared hook). It wraps `currentPushState/enablePush/disablePush` from `lib/push.js` and exposes `{ state, busy, status, turnOn, turnOff }`. The `turnOn` result handling (denied, server-not-configured, dismissed, error strings) is moved out of `NotificationsCard` verbatim.
- `frontend/src/components/NotificationBanner.jsx` (new). Home banner using the hook.
- `frontend/tests/notificationBanner.test.js` (new): `node --test` pure-logic tests for banner view-model helper and a source-wiring test in the style of `homeWiring.test.js`.
- Optional pure helper `frontend/src/utils/pushSupport.js` addition: `bannerViewFor(state, dismissed)` returning `{kind, title, body, cta}` (keeps it unit-testable under `node --test`, which has no DOM).

Modify:
- `frontend/src/components/NotificationsCard.jsx`: replace inline state with `usePushNotifications()`; markup and Profile behavior unchanged (it still offers "Turn off").
- `frontend/src/pages/Feed.jsx`: render `<NotificationBanner />` after the alert link and before `HomeTabs` (or directly after `ModeSwitcher`), only when `isAuthenticated` and not `authLoading`. It is mode-agnostic, so it works in Driver and Passenger modes. Keep `InstallSection` after tabs as is. Optionally hide `InstallSection` while the iOS banner is visible to avoid two stacked CTAs.
- `frontend/tests/homeWiring.test.js`: add `NotificationBanner` to the wiring assertion.
- No backend or `push-handler.js` changes.

### Feature 2: WhatsApp sharing
Create:
- `frontend/src/utils/share.js`: pure functions `getAppBaseUrl()`, `buildRideLink(id)`, `buildRequestLink(id)`, `buildRideShareText(ride, link)`, `buildRequestShareText(request, link)`, `buildWhatsAppUrl(text)`, and `openWhatsAppShare(text)`.
- `frontend/src/components/ShareWhatsAppButton.jsx`: button (green WhatsApp-style, `min-h-[44px]`, `aria-label`), props `{ kind: 'ride' | 'request', item, className }`. Calls `e.preventDefault(); e.stopPropagation()` so it works inside the `RideCard` link.
- `frontend/src/components/ListingUnavailable.jsx`: card titled "Listing Expired or Unavailable" with "Back to Home" link. Reused by `RideDetails` and the new request page.
- `frontend/src/pages/RequestDetails.jsx`: new page for `/requests/:id`. Loads `GET /requests/:id` (via a new `getRequestById` helper), shows a read-only summary (pickup, destination, date, time, vehicle, passenger count, first name, notes), the Share button, and for non-owner drivers an "Offer my ride" action via the existing `OfferPicker`. 404 or error shows `ListingUnavailable`; network error shows `OfflineNotice`.
- `frontend/tests/share.test.js`: unit tests for the templates, encoding, base URL fallback and "no phone/email/token in output".

Modify:
- `frontend/src/App.jsx`: add `<Route path="/requests/:id" element={<ProtectedRoute><RequestDetails /></ProtectedRoute>} />`. Place it AFTER `/requests/:id/matches` (React Router v6 ranks by specificity so order does not break, but keep it grouped).
- `frontend/src/services/api.js`: add `export const getRequestById = (id) => api.get(\`/requests/${encodeURIComponent(id)}\`);`
- `frontend/src/pages/RideDetails.jsx`: add Share button to the header card; replace the inline "Ride Unavailable" block (lines ~125-141) with `ListingUnavailable`, and fix the title to read "Listing Expired or Unavailable". Change the guest CTA to `<Link to="/login" state={{ from: location }}>` and add a register link with the same state.
- `frontend/src/components/RideCard.jsx`: add Share button in the footer row, outside the navigation (stopPropagation / preventDefault).
- `frontend/src/components/MyRidesList.jsx` (row at line ~196) and `MyRequestsList.jsx` (row at line ~115): add a Share button on each active row (hide for expired, cancelled and matched).
- `frontend/src/components/RequestCard.jsx`: add a Share button next to "Offer my ride", plus make the route text link to `/requests/:id` (optional, see decisions).
- `frontend/src/pages/Login.jsx` and `frontend/src/pages/Register.jsx`: read `useLocation().state?.from`, and after success `navigate(from ?? '/', { replace: true })`. Forward `state` in the "Register here" / "Sign in" links. Use a small helper `safeRedirect(from)` in `frontend/src/utils/nav.js` (exists, check contents when implementing) that only allows a same-origin path starting with `/` and not `//`, never `/login` or `/register`.
- `frontend/src/components/LoginPrompt.jsx`: unchanged unless you want it to forward state.
- `frontend/.env` (local, untracked values) and Vercel project env: add `VITE_APP_BASE_URL`. Add a documented example to `frontend/README.md` or a new `frontend/.env.example` (none exists today).
- Backend: no code change required. Optional hardening is listed in section 6.

## 4. Banner logic and PWA / service worker state checks

State is derived by the existing `currentPushState()`; the banner only maps it to UI.

```
// usePushNotifications()
state = 'loading'
on mount:
  state = await currentPushState()
  // 'unsupported' -> !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)
  // 'ios-needs-install' -> iOS UA && !(matchMedia('(display-mode: standalone)') || navigator.standalone)
  // 'denied' -> Notification.permission === 'denied'
  // 'on' -> permission === 'granted' && (await navigator.serviceWorker.ready).pushManager.getSubscription() != null
  // else 'off'
  if state === 'on': silently re-POST the existing subscription via pushSubscribe(subscriptionToPayload(sub))
      // idempotent upsert; refreshes the 90-day expiry and re-binds the endpoint to the logged-in user
      // never calls requestPermission, so no popup

turnOn():   // ONLY called from the button onClick (user gesture)
  enablePush():
    Notification.requestPermission()            // the only place a popup can appear
    key = (await getPushPublicKey()).data.data.key   // GET /api/push/public-key; VAPID_PUBLIC_KEY from the server env, null if not configured
    reg = await navigator.serviceWorker.ready
    sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(key)})
    await pushSubscribe(subscriptionToPayload(sub))   // POST /api/push/subscribe (upsert in MongoDB PushSubscription)
  results: ok -> 'on'; reason 'denied' -> 'denied'; 'server-not-configured' -> message; 'dismissed' -> stays 'off'
```

Banner rendering (`NotificationBanner`):

| state | UI |
|---|---|
| `loading` | render nothing (no layout shift: reserve nothing) |
| `off` | emerald-50 banner, bell icon, text "Get notified about new messages and ride requests", primary button "Turn On Notifications" (min-h 44px) |
| `on` | slim emerald chip "Notifications Enabled" with a check icon (non-intrusive; no button; Profile keeps "Turn off") |
| `denied` | amber banner: brief steps. "Notifications are blocked. Android/Chrome: tap the lock icon > Permissions > Notifications > Allow. iPhone: Settings > Notifications > Carpool. Desktop: site settings > Notifications > Allow, then reload." |
| `ios-needs-install` | sky banner: "On iPhone, tap Share, then Add to Home Screen, and open Carpool from your Home Screen to turn on notifications." (iOS Web Push only works for installed PWAs, iOS 16.4+.) Hide the button |
| `unsupported` | slate banner: "This browser can't show notifications. You'll still see the unread badge in the app." |

Behavior rules:
- Dismiss control (X) for `denied`, `ios-needs-install`, `unsupported` (stored in `localStorage` key `notifBannerDismissed:<state>`). `off` is not permanently dismissible, but it is a single compact row so it does not push the feed down much. `on` is a chip.
- `role="status"`/`aria-live="polite"` for result text; visible focus ring; wraps to a column on mobile (`flex-col sm:flex-row`).
- Rendered for authenticated users only, because every `/api/push/*` route requires login. Guests keep the existing `LoginPrompt` flow. (Assumption; alternative is a guest variant linking to `/login`.)
- Push payloads stay as today: generic text, with `data.url` `/chat` or `/matches`. No change.

## 5. Deep links, endpoints, WhatsApp encoder

### Routes
| Link | Route | Access | Backend |
|---|---|---|---|
| `{BASE}/rides/:id` | exists (`RideDetails`) | public | `GET /api/rides/:id` (public, no phone) |
| `{BASE}/requests/:id` | NEW (`RequestDetails`) | `ProtectedRoute` | `GET /api/requests/:id` (exists, protected, masked) |

Decision: requests stay behind login, because the whole `/api/requests` router is `protect`ed and request details are only shown to logged-in users today. Making them public would be a privacy-policy change, so I recommend against it. The guest flow is: open `/requests/:id`, `ProtectedRoute` redirects to `/login` with `state.from`, login redirects back. Gap: today login ignores `from`, fixed in Login and Register as above. For `/rides/:id` as a guest the page loads publicly; "Log in to Request a Seat" will now carry `state.from` so the user returns to the ride.

Redirect persistence across login <-> register: forward `location.state` in both links. Also mirror `from` to `sessionStorage` (`postAuthRedirect`) so a hard reload on the login page or an OAuth-less page refresh still returns to the listing; clear it after use.

Expired / deleted:
- Ride: `getRideById` returns 404 for missing or expired (`expiresAt <= now`). `RideDetails` shows `ListingUnavailable` (card text "Listing Expired or Unavailable"). Invalid ObjectId: `Ride.findById('abc')` throws a CastError that currently becomes a 500 (`sendServerError`). The frontend already treats any non-network error as unavailable, so no crash; optional backend fix: validate with `mongoose.isValidObjectId` and return 404.
- Request: `getRequestById` returns 404 (`notFound`) for missing, non-ACTIVE or expired (owners see their own until purge). `loadRequest` already validates ObjectId. Any 404/400 -> `ListingUnavailable`.

### WhatsApp URL / message strategy (`frontend/src/utils/share.js`)
```
getAppBaseUrl():
  env = import.meta.env.VITE_APP_BASE_URL   // e.g. https://carpooling.example.com
  base = env?.trim() || window.location.origin
  return base.replace(/\/+$/, '')            // also validate with new URL(); fall back to origin on failure
buildRideLink(id)    = `${base}/rides/${encodeURIComponent(id)}`
buildRequestLink(id) = `${base}/requests/${encodeURIComponent(id)}`
buildWhatsAppUrl(text) = 'https://wa.me/?text=' + encodeURIComponent(text)
openWhatsAppShare(text): window.open(url, '_blank', 'noopener,noreferrer'); // user click only
```
Use `https://wa.me/?text=` (universal: opens the app on mobile and WhatsApp Web on desktop). Do not use `whatsapp://` since it fails on desktop browsers without the app. If `window.open` returns null (popup blocked), fall back to `window.location.assign(url)`.

Templates use explicit `\n\n` between lines exactly as specified:
- Ride: `🚗 Carpooling Ride Available!\n\n📍 From: ${pickupLocation}\n\n📍 To: ${destination}\n\n📅 Date: ${rideDate}\n\n🕒 Departure: ${formatTime12Hour(departureTime)}\n\n🚘 Vehicle: ${Car|Bike}\n\n💺 Seats: ${availableSeats}\n\nView details & request to join on Carpooling:\n\n${link}`
- Request: `🙋 Ride Request on Carpooling!\n\n📍 Pickup: ${pickupLocation}\n\n📍 Destination: ${destination}\n\n📅 Date: ${requestDate}\n\n🕒 Preferred Time: ${formatTime12Hour(departureTime)}\n\n${🏍️|🚘} Vehicle Preference: ${Bike|Car}\n\nView the request on Carpooling:\n\n${link}`
- Vehicle label from `normalizeVehicleType` (`utils/vehicle.js`); date formatted as stored (`YYYY-MM-DD`) or via `formatDateChip` (decision: use readable `weekday, label` like the cards, with the ISO date fallback).
- Whitelist-only builder: the functions read only `pickupLocation, destination, date, departureTime, vehicle, availableSeats` and `id`. They never touch `driver`, `passenger`, `phone`, `email`, `notes` or tokens. The link contains no query params, so no JWT/phone can ride along. Notes are intentionally omitted from the message.
- Free-text guard: strip control characters and cap each field at ~100 chars (the backend already caps locations at 100).

## 6. Environment variables (names only)

| Name | Where | Exists? | Notes |
|---|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | backend `.env` + Vercel (backend project) | Yes (local .env has all three; `.env.example` documents) | Must be set in Vercel for the banner to work in prod; otherwise `server-not-configured` message. Public key is served by `GET /api/push/public-key`, so no frontend VAPID var is needed. |
| `CLIENT_URL` | backend `.env` + Vercel | Yes | CORS allow-list for production domain. Keep equal to the frontend production origin. |
| `VITE_API_URL` | frontend `.env` + Vercel (frontend project) | Yes | unchanged |
| `VITE_APP_BASE_URL` | frontend `.env` + Vercel (frontend project) | NEW | Production domain, e.g. `https://<your-domain>` with no trailing slash. Falls back to `window.location.origin` when unset, so it never hardcodes localhost; keep unset locally. Must be set before the production build (Vite inlines at build time, so redeploy after adding). |
| `APP_BASE_URL` | -- | NOT needed | Links are built client-side; the backend never generates share links. Only add if you later want server-rendered share previews. |

## 7. Risks and gaps

1. Missing `/requests/:id` route and page (App.jsx). Needs creating (Feature 2).
2. Post-login redirect not implemented: `Login.jsx` line 22, `Register.jsx` line 40 ignore `state.from`. Needed for the auth fallback; open-redirect risk if not validated, so use a same-origin path allowlist helper.
3. Request details require login by design (`requestRoutes.js` line 22). A WhatsApp recipient who is not registered must sign up first. Making them public is a privacy decision I did not assume.
4. RideCard is a single `<Link>`. A nested `<button>` inside `<a>` is invalid HTML and would navigate on click. Fix: stopPropagation/preventDefault, or restructure the footer so the button sits outside the anchor (preferred: wrap card in a `div` with a stretched link). Keyboard and screen-reader behavior must be checked.
5. Phone leakage: none found in the single-item ride/request endpoints or push payloads. Residual: `Ride.whatsappNumber` is still collected at creation (`rideController.js` lines 77-147, 259) and stored. Every read path strips it today, but one forgotten `.select('-whatsappNumber')` in a future endpoint would leak it. Recommend a schema-level `select: false` on `Ride.whatsappNumber` as defense in depth (backend change, needs your OK; not required for these features).
6. Invalid ObjectId on `GET /api/rides/:id` yields a 500 from CastError (`rideController.getRideById`). The UI still shows the unavailable card, but the server logs an error. Optional fix: `mongoose.isValidObjectId` guard returning 404.
7. Push on iOS only works for installed PWAs (iOS 16.4+). The banner shows the Add-to-Home-Screen guidance in that case; the permission prompt is never attempted in Safari tab mode (already enforced by `pushSupportState`).
8. Silent re-sync on mount: one extra `POST /api/push/subscribe` per Home visit for subscribed users. It is rate-limited at 30/min; throttle with a `sessionStorage` flag so it runs once per session. Keeps the Vercel free tier safe.
9. Service worker update: `registerType: 'prompt'` means users on an old SW see new UI only after the existing `UpdatePrompt`. The banner needs no SW change, so it is unaffected.
10. `VITE_APP_BASE_URL` is baked in at build time; a wrong value (e.g. includes a path or trailing slash) would break links. `getAppBaseUrl()` normalizes and falls back to `window.location.origin`.
11. `homeWiring.test.js` regex-checks Feed contents, so the Feed edit must keep the names it asserts.
12. WhatsApp share text includes route/date/time (public listing data, same as the public feed). Owner-only data like notes is excluded. Request sharing exposes a passenger's pickup and destination to whoever receives the link; the user chooses to send it, but it is worth a one-line hint under the button ("Anyone with the link who is logged in can view this request").
13. Zero-cost compliance: no new services, no packages, no DB schema or storage changes. No new dependencies are needed (`lucide-react` already provides `Bell`, `Share2`, `MessageCircle`, `CheckCircle2`, `X`).

## 8. Recommended implementation order (after approval; all changes uncommitted)

1. `utils/share.js` + `tests/share.test.js` (pure, no UI). Verify: `cd frontend; npm test`.
2. Auth redirect: `utils/nav.js` helper (safe redirect), `Login.jsx`, `Register.jsx`, `RideDetails.jsx` guest CTA. Add tests for the helper. Verify: `npm test`, manual login-return check.
3. `ListingUnavailable.jsx`, `getRequestById` in `api.js`, `RequestDetails.jsx`, route in `App.jsx`; update `RideDetails.jsx` unavailable card.
4. `ShareWhatsAppButton.jsx` and wiring into `RideCard`, `RequestCard`, `MyRidesList`, `MyRequestsList`, `RideDetails`, `RequestDetails`.
5. `usePushNotifications.js` hook; refactor `NotificationsCard.jsx` onto it (no behavior change on Profile).
6. `NotificationBanner.jsx` + `Feed.jsx` placement + `homeWiring.test.js` + banner tests.
7. Env: add `VITE_APP_BASE_URL` to `frontend/.env` (leave unset locally if preferred) and to Vercel; document in an `.env.example`.
8. Full check: `cd frontend; npm run lint; npm test; npm run build`. Backend untouched unless you approve optional items 5-6 above (`cd backend; npm test`).

## 9. Verification steps

### Desktop (Chrome/Edge, Firefox)
1. `cd backend; npm run dev`, `cd frontend; npm run dev`. Note: the service worker is disabled in dev (`devOptions.enabled: false`), so push testing needs `npm run build; npx vite preview` (served on http://localhost, which counts as a secure context).
2. Log in. Home shows "Turn On Notifications" in both Driver and Passenger modes (toggle `ModeSwitcher`). No browser popup appears on load.
3. Click the button: the browser permission prompt appears. Allow -> banner becomes "Notifications Enabled"; check a `PushSubscription` document exists in MongoDB for the user. Reload: still "Notifications Enabled", no popup.
4. Block notifications in site settings and reload: denied instructions show. Re-allow, reload, click again.
5. From another account send a chat message or ride request: notification reads "New message received" / "New ride request" with no message text.
6. In a browser lacking support (or by stubbing `window.PushManager = undefined` in DevTools before load) the unsupported explanation shows, and nothing crashes.
7. Share: on a ride card, ride detail, My Rides row, My Requests row and request detail, click "Share on WhatsApp". A new tab opens `https://wa.me/?text=...` with the exact template. Copy the decoded text and confirm there is no phone, email or token. Link host equals `VITE_APP_BASE_URL` in the preview build or the current origin when unset.
8. Open the copied link in a private window: `/rides/:id` loads publicly; `/requests/:id` redirects to `/login`, then returns to the request after login (and after register).
9. Delete or expire a listing and open its link; "Listing Expired or Unavailable" card shows, with a working Back link. Try a garbage id (`/rides/xyz`, `/requests/xyz`).
10. Direct URL load of `/rides/:id` on the Vercel preview returns the app (no 404).
11. `cd frontend; npm run lint; npm test; npm run build` pass.

### Mobile PWA
1. Android Chrome: open the deployed site over HTTPS, install via the install button, launch standalone. Home banner shows; tap, allow, "Notifications Enabled". Lock the phone and trigger a push: generic text only; tapping the notification opens `/chat` or `/matches`.
2. Android: deny the prompt; banner shows the denied instructions; follow them in Settings.
3. iPhone Safari (browser tab): banner shows Add to Home Screen guidance and no permission prompt. After Add to Home Screen and launching from the icon (iOS 16.4+), banner shows "Turn On Notifications"; grant and confirm push arrives.
4. Share from a phone: tap Share on WhatsApp, WhatsApp opens with the prefilled text. Tap the link from a chat: it opens the deployed site (or the installed PWA where supported) at the listing; when logged out you are asked to log in and then returned to the listing.
5. Check layout at 320-430px wide: the banner wraps, tap targets are at least 44px, nothing overlaps `BottomNav` or `ModeFab`, and the iOS safe-area padding (`pl-safe pr-safe`) is respected.

## 10. Assumptions made
- Banner shown to logged-in users only (push APIs need auth).
- `/requests/:id` remains login-protected.
- WhatsApp URL is `https://wa.me/?text=` only.
- Share buttons appear on active listings only, and request sharing is available to the owner (on `MyRequestsList` and `RequestDetails`) and on `RequestCard` for drivers browsing.
- No backend change is required to ship; the two backend hardening items (schema `select:false`, ObjectId guard) are optional and need your approval.
