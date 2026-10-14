# PWA implementation report (iteration 1)

No `pwa-review.json` existed, so this was the first full implementation. Nothing was committed, pushed or deployed. `backend/` was not touched.

## Dependencies
- Dev, exact-pinned: `vite-plugin-pwa` 2.0.0 and `@vite-pwa/assets-generator` 2.0.0. No peer conflict with vite 8.3.0.
- `npm install` printed `TAR_ENTRY_ERROR` warnings, which looked like Windows file locks. I then ran `npm.cmd ci` and it gave a clean tree. npm audit reports 1 high-severity vulnerability in the dev tree (pulled in transitively). I did not change it.

## Files
New:
- `frontend/public/logo.svg` (original logo: white car + two rider dots on #059669, full-bleed)
- Generated icons: `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`
- `frontend/pwa-assets.config.js`
- `src/components/UpdatePrompt.jsx`, `InstallPrompt.jsx`, `OfflineBanner.jsx`, `OfflineNotice.jsx`
- `src/hooks/useOnlineStatus.js`, `src/utils/networkError.js`
- `tests/networkError.test.js`

Modified:
- `package.json` (deps + `generate-pwa-assets` script), `package-lock.json`
- `vite.config.js`, `index.html`, `vercel.json`, `README.md` (the Vite boilerplate was replaced)
- `public/favicon.svg` (now a copy of logo.svg)
- `src/App.jsx`, `src/index.css`
- Components: `BottomNav.jsx`, `NoticeModal.jsx`, `ConfirmationModal.jsx`
- `src/context/AuthContext.jsx`, `src/services/api.js`
- Pages: `Feed.jsx`, `RoadStatus.jsx`, `RideDetails.jsx`, `MyRides.jsx`

## Commands and results (run from `frontend/`)
- `npm.cmd run generate-pwa-assets`: succeeded and wrote the 5 PNGs + favicon.ico. I checked each PNG by eye. The car mark is visible, white on green, and not clipped. The maskable icon has wide safe-zone padding.
- `npm.cmd run build`: succeeded. `dist/` contains `manifest.webmanifest`, `sw.js`, `workbox-98f7a950.js`, `logo.svg`, `favicon.svg/.ico` and all 5 PNGs. The SW precaches 19 entries (447 KiB). `dist/index.html` has `<link rel="manifest" href="/manifest.webmanifest">` and theme-color `#059669`.
- `dist/manifest.webmanifest`: name Carpooling, short_name Carpool, start_url/scope `/`, display standalone, theme `#059669`, background `#F8FAFC`, no orientation. Icons are 64/192/512 with purpose `any` and 512 with purpose `maskable`.
- `dist/sw.js` routes:
  - `NavigationRoute(/index.html, denylist [/^\/api\//])`
  - `registerRoute(pathname.startsWith("/api/"), NetworkOnly, "GET")`
  - `registerRoute(/^http:\/\/localhost:5000\//, NetworkOnly, "GET")` (taken from the local `.env` VITE_API_URL)
  - No `CacheFirst`, `StaleWhileRevalidate` or `NetworkFirst`. No route for non-GET.
- Bug found and fixed during verification: a closure-based origin matcher got serialized into sw.js with an undefined `apiOrigin`. It is now a RegExp built at build time.
- Also fixed: `includeAssets` was dropped because it duplicated precache entries (23 → 19).
- `npm.cmd test`: 28 pass, 0 fail (21 existing + 7 new).
- `npm.cmd run lint`: 0 errors, 14 warnings. That matches the baseline; every warning is in a pre-existing line or file.
- Secret grep of `dist`: the only matches are library strings (tailwindcss.com, reactrouter.com, and axios URL-credential handling `password:`). `.env` has only the `VITE_API_URL` key.
- `npm.cmd run preview` on port 4179:
  - `/manifest.webmanifest` → 200 application/manifest+json
  - `/sw.js` → 200 text/javascript
  - `/pwa-192x192.png` → 200 image/png
  - `/rides/abc` → 200 text/html
  - The server was killed afterwards and the port is confirmed free.
- `vercel.json`: still valid JSON and the rewrite is unchanged.

## Behavior notes
- Auth: `/auth/me` now logs out only on 401/403. Network errors keep the token. Separately, the axios 401 interceptor removes the token (except for login/register) with no redirect and no retry.
- Offline: Feed, RoadStatus, RideDetails and MyRides show "You appear to be offline — can't load …" with Retry and clear stale data. Non-network errors behave as before.
- Top safe area: the inset is applied once, on a `pt-safe bg-slate-900` wrapper around OfflineBanner + TopAnnouncementBar. Navbar stays sticky `top-0`. With status-bar-style `default` the top inset is 0 in iOS standalone portrait.

## Not tested
- Physical Android/iOS devices, the install flows, and home-screen icon rendering.
- Lighthouse PWA audit, and real browser offline toggling / update-prompt flow (no browser automation available).
- Vercel header behavior in production.

## Remaining risks
- If a notched device does report a top inset, the sticky Navbar can sit under the status bar after scrolling, because the inset sits on the non-sticky wrapper above it.
- iOS: separate storage means users re-login after install, and storage can be evicted.
- The JWT in localStorage is exposed to any XSS.
- The production API origin rule depends on `VITE_API_URL` at build time. The `/api/` path rule covers the default URL shape anyway.
- The npm audit high-severity item in dev deps is unaddressed.
