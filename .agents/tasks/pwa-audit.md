# PWA Audit: Carpooling (read-only)

## Summary
The frontend builds cleanly (Vite 8.3.0, React 19.2, Tailwind 4.3 via `@tailwindcss/vite`, react-router-dom 7). It has zero PWA support today: no manifest, no service worker, no PNG icons, a placeholder `<title>frontend</title>`, and no theme-color, apple, or safe-area meta tags. `vite-plugin-pwa@2.0.0` lists `vite ^8.0.0` in its peer range, so it fits without upgrading anything. `@vite-pwa/assets-generator@2.0.0` is free and can render PNG icons from `public/favicon.svg`. The biggest functional risk is in `AuthContext.jsx`: any failure of `/auth/me`, including a network error while offline, calls `logout()`. That wipes the token, so an offline launch of the installed app would sign the user out.

## Evidence
- Git: clean tree on `main` = `origin/main`, HEAD `ef96ee9 rebuild the whole app`.
- `frontend/package.json` has these scripts: `dev`, `build` (`vite build`), `lint` (`oxlint`), `test` (`node --test tests/*.test.js`) and `preview`. Note: `npm.ps1` is blocked by the PowerShell execution policy, so use `npm.cmd`.
- Build: OK. JS bundle is 392.8 kB (120 kB gzip), CSS is 34 kB.
- Tests: 21/21 pass (`tests/impactCalculator.test.js`, `tests/nlpSearchParser.test.js`). The backend tests were not run.
- Lint: 0 errors and 14 warnings, all pre-existing (unused imports; "immutability" warnings in AuthContext, Feed, MyRides and RoadStatus).
- `vite.config.js` has only the `react()` and `tailwindcss()` plugins.
- `tailwind.config.js` sets primary `#10B981` and hover `#059669`. Under Tailwind v4 this JS config is probably unused, and the components use `emerald-*` and `slate-*` utilities directly.
- `index.html` has only the viewport meta (no `viewport-fit=cover`) and an SVG favicon.
- `public/` contains only `favicon.svg`.
- `frontend/vercel.json` has a catch-all rewrite to `/index.html` and no headers. Static files like `sw.js` are served before the rewrite. Still, add `Cache-Control: no-cache` for `/sw.js` and `/manifest.webmanifest`.
- `src/services/api.js`:
  - The base URL comes from `VITE_API_URL`; `.env` contains only this one variable name, so no secrets are exposed.
  - It falls back to `http://<host>:5000/api` when the variable is unset or points at localhost.
  - A request interceptor adds `Bearer` from `localStorage.carpool_token`. There is no response or 401 interceptor.
- `src/context/AuthContext.jsx`:
  - The token is in localStorage, with no expiry check on the client.
  - The `catch` around `/auth/me` calls `logout()` for any error, not only a 401. This must change to logout on 401/403 only.
- `backend/controllers/rideController.js` (getRideById): `whatsappNumber` and `wa.me` links are returned only when `req.user` is set. This gating is good. It also means ride-detail responses for logged-in users contain private phone numbers and must not be cached.
- `backend/server.js` CORS allows `*.vercel.app`, localhost, LAN and `CLIENT_URL`. An installed PWA uses the same origin, so no change is needed.
- RoadStatus returns `updatedAt`, and the UI already shows relative time plus a ">12h" stale badge (`RoadStatus.jsx` ~352–383). This can be reused for freshness messaging.
- `App.jsx` puts `pb-16` on the root, and `BottomNav` is `fixed bottom-0 h-14` with no `env(safe-area-inset-bottom)`. On iPhones with a home indicator it will overlap the indicator. The top bar and navbar also need safe-area top padding in standalone mode.
- `TopAnnouncementBar` and `NoticeModal` use `tel:` links, which work in standalone mode.

## Recommendations
1. Add `vite-plugin-pwa@2.0.0` (pinned) with `registerType: 'prompt'` and `injectRegister: false`, using `useRegisterSW` from `virtual:pwa-register/react`. Add `@vite-pwa/assets-generator@2.0.0` (pinned) as a dev dependency.
2. Manifest settings:
   - name `Carpooling`, short_name `Carpool`, plus a description
   - start_url `/`, scope `/`, display `standalone`
   - orientation `portrait` (or omit it so tablets can rotate)
   - theme_color `#10B981`, background_color `#F8FAFC` (slate-50)
   - icons: 64, 192, 512, and a maskable 512, plus `apple-touch-icon-180x180.png` generated from `favicon.svg` via `pwa-assets.config.js` (`minimal2023Preset`)
3. Workbox setup:
   - Precache `**/*.{js,css,html,svg,png,ico,webmanifest}`.
   - Set `navigateFallback: '/index.html'`.
   - Add `runtimeCaching` with `NetworkOnly` for the API origin/`/api/`. Never cache auth, rides, my-rides or road-status responses, and never cache non-GET requests.
   - Add `cleanupOutdatedCaches`.
4. `index.html` changes:
   - title "Carpooling"
   - `viewport-fit=cover`
   - `theme-color`
   - `apple-mobile-web-app-capable`, `-status-bar-style` (`default`) and `-title` "Carpool"
   - an `apple-touch-icon` link
   - a description
5. New components:
   - `OfflineBanner` (`navigator.onLine` plus online/offline events, with a Retry button)
   - `UpdatePrompt` (toast with Reload/Dismiss)
   - `InstallPrompt` (Android: `beforeinstallprompt`; iOS Safari: Share → Add to Home Screen instructions; hidden when `display-mode: standalone` or `navigator.standalone`)
   - Mount all three in `App.jsx`.
6. Pages: Feed, RoadStatus, RideDetails and MyRides should show an explicit "You're offline, can't load current rides/road info" state with Retry when a request fails with no response, instead of an empty or stale list.
7. Fix AuthContext to keep the session on network errors and log out only on 401/403. Optionally add a 401 response interceptor in `api.js`.
8. Safe-area CSS in `index.css`: utilities for `env(safe-area-inset-*)`. Apply them to `BottomNav` (`pb-[env(safe-area-inset-bottom)]`), the root padding, and the top bar or navbar.
9. Add a `vercel.json` headers block with no-cache for `/sw.js`, `/registerSW.js` and `/manifest.webmanifest`, and immutable caching for `/assets/*`.
10. Add `frontend/README` docs covering install steps for Android and iOS, the update flow and offline behaviour.

Files to modify: `frontend/package.json` (plus lockfile), `vite.config.js`, `index.html`, `vercel.json`, `src/App.jsx`, `src/index.css`, `src/context/AuthContext.jsx`, `src/components/BottomNav.jsx`, `src/pages/{Feed,RoadStatus,RideDetails,MyRides}.jsx`, `README.md`.
Files to create: `pwa-assets.config.js`, `public/pwa-*.png`, `public/apple-touch-icon-180x180.png`, `public/maskable-icon-512x512.png`, `src/components/{OfflineBanner,UpdatePrompt,InstallPrompt}.jsx`, `src/hooks/useOnlineStatus.js`, and a small test in `tests/` for any pure helper (e.g. an offline error classifier).

## Risks
- Tokens in localStorage are exposed to XSS. This is unchanged by the PWA, and moving to httpOnly cookies is out of scope.
- A stale service worker can serve an old bundle. Mitigate with the prompt update flow and no-cache headers on `sw.js`.
- iOS limits:
  - no `beforeinstallprompt`
  - storage is separate from Safari, so users log in again after installing
  - possible eviction after weeks of no use
  - push notifications only on iOS 16.4+, and not in scope here
- `favicon.svg` artwork may not suit a maskable icon (needs a safe zone with padding). Check the generated output.
- The Tailwind v4 JS config is likely ignored, so take colours from the emerald and slate utilities.

## Testing plan
- Automated: `npm.cmd run build` (confirm `dist/manifest.webmanifest`, `dist/sw.js` and the icons exist), `npm.cmd test`, `npm.cmd run lint` (no new warnings).
- Manual on `npm.cmd run preview`:
  - DevTools Application tab: manifest valid, SW active, offline toggle shows the banner and no blank screen.
  - Check that Cache Storage contains no API responses.
  - Lighthouse PWA/installability audit.
- Devices:
  - Android Chrome: install, standalone launch, icon, login persists, WhatsApp link opens the app, airplane mode, update after redeploy.
  - iPhone Safari: Add to Home Screen, safe areas, status bar.

## Open questions
1. Is theme colour `#10B981` (emerald) OK, or do you want a darker one like `#059669`?
2. Do you have logo artwork, or should icons be generated from the current `favicon.svg`?
3. Should public data (the ride feed or road status) be cached for offline viewing with a "last updated" label? The default recommendation is no; show live data only.
