# Implementation Plan: PWA for Carpooling frontend

Repo: `d:\Mubashir\carpooling\carpooling` (branch `main`, work in place, NO worktree). Do NOT commit/push/deploy. Do NOT touch `backend\`.
Frontend root: `d:\Mubashir\carpooling\carpooling\frontend` (FE below). Run all commands with `cwd` = FE using `npm.cmd` / `npx.cmd`.
Commands: build `npm.cmd run build`, test `npm.cmd test` (node --test tests/*.test.js, currently 21 pass), lint `npm.cmd run lint` (baseline 0 errors / 14 warnings; no new warnings allowed).
Authoritative decisions: theme_color `#059669`, background_color `#F8FAFC`, original new logo, live data only (no API caching), rotation allowed (omit `orientation`).

Confirmed current state: `vite.config.js` has only `react()` + `tailwindcss()`; `index.html` title `frontend`, no meta; `public\` has `favicon.svg`, `icons.svg`; `vercel.json` only SPA rewrite; `App.jsx` root `min-h-screen flex flex-col pb-16 md:pb-0 bg-slate-50`; `BottomNav.jsx` outer `md:hidden fixed bottom-0 ... px-2`, inner `h-14`; `AuthContext.jsx` catch calls `logout()` on any error; `frontend\README.md` is Vite boilerplate (1 KB); no `src\hooks\` dir yet; tests import from `../src/utils/*.js` with `node:test` + `node:assert/strict`.

- [ ] 1. Install pinned dev dependencies.
      `npm.cmd install -D --save-exact vite-plugin-pwa@2.0.0 @vite-pwa/assets-generator@2.0.0`. Confirm package.json shows exact `2.0.0` (no caret) for both. If peer-dep conflict with vite 8.3.0 appears, stop and report (audit says peer range includes `^8.0.0`).
      Files: FE\package.json, FE\package-lock.json
      Verify: `npm.cmd run build` succeeds (plugin not yet wired).

- [ ] 2. Create original logo and update favicon.
      Write `FE\public\logo.svg`: 512x512 viewBox, full-bleed `<rect>` fill `#059669` (no rounded corners so maskable crop is clean), a simple white car-side silhouette with two wheels plus a small "shared" mark (e.g. two overlapping person dots or a curved arrow above the roof), all artwork within the central ~60% (≈ 102–410 px) for maskable safe zone. Pure shapes/paths, no text, no external fonts. Decision: index.html `rel="icon"` points at `/logo.svg`, and `FE\public\favicon.svg` is overwritten with an identical copy of logo.svg so cached/stale references also show the new logo.
      Files: FE\public\logo.svg (new), FE\public\favicon.svg
      Verify: open the SVG via the read tool / render step in item 3 and confirm it looks like a car on emerald.

- [ ] 3. Generate PNG icons.
      Create `FE\pwa-assets.config.js`:
      ```js
      import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'
      export default defineConfig({
        headLinkOptions: { preset: '2023' },
        preset: { ...minimal2023Preset,
          maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#059669' } },
          apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#059669' } } },
        images: ['public/logo.svg'],
      })
      ```
      Add script `"generate-pwa-assets": "pwa-assets-generator"` to package.json and run `npm.cmd run generate-pwa-assets`. Expect in `FE\public\`: `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` (also a `favicon.ico` may be produced — keep it). View each PNG with the read_file image tool and confirm: car visible, white on #059669, not clipped, maskable has padding. Fix logo.svg and regenerate if not.
      Files: FE\pwa-assets.config.js (new), FE\package.json, FE\public\*.png (generated)
      Verify: the five PNGs exist and visually check out.

- [ ] 4. Configure vite-plugin-pwa in `FE\vite.config.js`.
      Import `{ VitePWA } from 'vite-plugin-pwa'`; add to plugins after tailwindcss():
      - `registerType: 'prompt'`, `injectRegister: false`, `includeAssets: ['favicon.svg','favicon.ico','logo.svg','apple-touch-icon-180x180.png']`
      - manifest: `name 'Carpooling'`, `short_name 'Carpool'`, `description 'Share rides and check road status for your daily commute.'`, `start_url '/'`, `scope '/'`, `display 'standalone'`, `theme_color '#059669'`, `background_color '#F8FAFC'`, no `orientation`; icons: pwa-64x64 (`purpose:'any'`), pwa-192x192 (`any`), pwa-512x512 (`any`), maskable-icon-512x512 (`purpose:'maskable'`), all `type:'image/png'`.
      - workbox: `globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}']`, `navigateFallback: '/index.html'`, `navigateFallbackDenylist: [/^\/api\//]`, `cleanupOutdatedCaches: true`, `runtimeCaching`: (a) `urlPattern: ({url}) => url.pathname.startsWith('/api/')` handler `'NetworkOnly'`; (b) if `process.env.VITE_API_URL` / `loadEnv(mode, process.cwd(), '')` yields an origin, `urlPattern: ({url}) => url.origin === apiOrigin`, `'NetworkOnly'`. Use `defineConfig(({ mode }) => …)` with `loadEnv` to read VITE_API_URL safely (wrap `new URL()` in try/catch). Add a third catch-all for cross-origin requests to port 5000 is unnecessary — the `/api/` pathname rule already covers the `http://<host>:5000/api` fallback in api.js. No `method` overrides: NetworkOnly + default GET matching; non-GET is never cached by Workbox.
      - `devOptions: { enabled: false }`.
      Files: FE\vite.config.js
      Verify: `npm.cmd run build`; confirm `FE\dist\sw.js`, `FE\dist\manifest.webmanifest`, `FE\dist\workbox-*.js` exist; manifest JSON has the colors/icons above; `sw.js` contains `NetworkOnly` and no `CacheFirst`/`StaleWhileRevalidate`.

- [ ] 5. Update `FE\index.html` head.
      `<title>Carpooling</title>`; viewport `width=device-width, initial-scale=1.0, viewport-fit=cover`; `<meta name="description" …>` (same text as manifest); `<meta name="theme-color" content="#059669">`; `<meta name="apple-mobile-web-app-capable" content="yes">`; `<meta name="mobile-web-app-capable" content="yes">`; `<meta name="apple-mobile-web-app-status-bar-style" content="default">`; `<meta name="apple-mobile-web-app-title" content="Carpool">`; `<link rel="icon" href="/favicon.ico" sizes="48x48">` (only if generated), `<link rel="icon" type="image/svg+xml" href="/logo.svg">`; `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`. Manifest link is auto-injected by the plugin.
      Files: FE\index.html
      Verify: `npm.cmd run build`; `FE\dist\index.html` contains the metas and a `<link rel="manifest" href="/manifest.webmanifest">`.

- [ ] 6. Add network-error helper + test.
      `FE\src\utils\networkError.js`: `export function isNetworkError(err)` → true when `err` is truthy, `err.response` is falsy, and it is not a cancellation (`err.code !== 'ERR_CANCELED'` and `err.name !== 'CanceledError'`); true also for `err.code === 'ERR_NETWORK'`. Also `export function isAuthError(err)` → `[401,403].includes(err?.response?.status)`. No imports (keeps node:test runnable).
      `FE\tests\networkError.test.js` following the style of `tests\impactCalculator.test.js`: cases for no-response error, ERR_NETWORK, 500 response (false), 401 (isAuthError true, isNetworkError false), canceled (false), null/undefined (false).
      Files: FE\src\utils\networkError.js, FE\tests\networkError.test.js
      Verify: `npm.cmd test` — all prior 21 + new tests pass.

- [ ] 7. Fix auth session handling (depends on 6).
      In `FE\src\context\AuthContext.jsx` loadUser catch: `if (isAuthError(error)) logout(); else console.warn('Could not verify session (keeping it):', error.message)`. Keep `setLoading(false)`. Note: with a network error `user` stays null so `isAuthenticated` is false; to avoid ProtectedRoute kicking an offline user to login, keep that behavior unchanged (live data only, protected pages need network anyway) — just don't wipe the token, so the next online load restores the session.
      In `FE\src\services\api.js` add a response interceptor: on status 401 for any request whose url is not `/auth/login` or `/auth/register`, `localStorage.removeItem('carpool_token')` then `return Promise.reject(error)` (no redirect, no retry, so no loops). Read api.js first and preserve existing request interceptor/baseURL logic.
      Files: FE\src\context\AuthContext.jsx, FE\src\services\api.js
      Verify: `npm.cmd run build` and `npm.cmd run lint` (no new warnings).

- [ ] 8. Online status hook + OfflineBanner.
      `FE\src\hooks\useOnlineStatus.js`: `useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)`, subscribe to window `online`/`offline` in useEffect with cleanup, return boolean.
      `FE\src\components\OfflineBanner.jsx`: renders nothing when online; when offline a `role="status" aria-live="polite"` amber bar ("You're offline. Live rides and road info can't load.") with a `<button type="button">Retry</button>` that calls `window.location.reload()` only if `navigator.onLine`, otherwise no-op. Position: sticky top, below safe-area (`pt-safe` from item 11 or inline).
      Files: FE\src\hooks\useOnlineStatus.js, FE\src\components\OfflineBanner.jsx
      Verify: build passes.

- [ ] 9. UpdatePrompt.
      `FE\src\components\UpdatePrompt.jsx` using `useRegisterSW` from `virtual:pwa-register/react` (`{ needRefresh:[needRefresh,setNeedRefresh], offlineReady:[offlineReady,setOfflineReady], updateServiceWorker }`). When `needRefresh`: fixed toast (bottom-right on md, above BottomNav on mobile: `bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-4`), `role="alert"`, text "New version available", buttons "Reload" → `updateServiceWorker(true)` and "Later" → `setNeedRefresh(false)`. When `offlineReady` only: small dismissible "App ready to work offline (live data still needs a connection)" with Close → `setOfflineReady(false)`. Never call updateServiceWorker automatically. Add `/// <reference types="vite-plugin-pwa/react" />` is TS-only — skip; JS works.
      Files: FE\src\components\UpdatePrompt.jsx
      Verify: build passes.

- [ ] 10. InstallPrompt.
      `FE\src\components\InstallPrompt.jsx`:
      - `isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true`; if true render null.
      - Dismiss key `carpool_install_dismissed_at` in localStorage (wrap access in try/catch); hidden if `Date.now() - value < 14*24*60*60*1000`.
      - Listen to `beforeinstallprompt`: `e.preventDefault()`, store event in state, show card "Install Carpooling" with buttons "Install" (calls `deferred.prompt()`, awaits `userChoice`, clears event) and "Not now" (writes dismiss timestamp). Only show the Android/Chromium card if the event fired.
      - Listen to `appinstalled`: clear event, set `installed` true → render null (never claim installed otherwise).
      - iOS Safari detection: `/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)` and Safari (`/safari/i` and not `/crios|fxios|edgios/i`). Show instructions card: "Install: tap the Share button, then 'Add to Home Screen'." with lucide `Share` icon (`aria-hidden`) and "Got it" dismiss button.
      - Card: `role="dialog"` `aria-labelledby` heading id, close button `aria-label="Dismiss install prompt"`, positioned like UpdatePrompt but not overlapping it (render UpdatePrompt above; InstallPrompt hidden while... keep simple: stack with `bottom` offset 8rem).
      Files: FE\src\components\InstallPrompt.jsx
      Verify: build + lint pass.

- [ ] 11. Safe-area CSS and layout (mount components).
      In `FE\src\index.css` (after the tailwind import) add `@utility pt-safe { padding-top: env(safe-area-inset-top); }`, `pb-safe { padding-bottom: env(safe-area-inset-bottom); }`, `pl-safe`, `pr-safe`, and `@utility pb-nav-safe { padding-bottom: calc(4rem + env(safe-area-inset-bottom)); }`.
      - `FE\src\App.jsx`: root `pb-16` → `pb-nav-safe md:pb-0`; add `pl-safe pr-safe`; mount `<OfflineBanner />` before `<TopAnnouncementBar />`, `<UpdatePrompt />` and `<InstallPrompt />` after `<BottomNav />`.
      - `FE\src\components\BottomNav.jsx`: outer div add `pb-safe` (inner `h-14` unchanged, so total height = 14 + inset).
      - `FE\src\components\TopAnnouncementBar.jsx` (first element at top): add `pt-safe` to its outer wrapper; if Navbar is sticky/fixed independently, add `pt-safe` there instead — read both and apply to whichever sits at the viewport top (only one, to avoid double padding). OfflineBanner placed above it must then carry `pt-safe` itself and TopAnnouncementBar not — decision: put `pt-safe` on a wrapper `<div className="pt-safe bg-...">` in App.jsx around OfflineBanner+TopAnnouncementBar+Navbar if they are not sticky; read the files and choose so exactly one element gets the top inset.
      - `FE\src\components\NoticeModal.jsx`, `FE\src\components\ConfirmationModal.jsx`: ensure the dialog panel has `max-h-[calc(100dvh-2rem)] overflow-y-auto` and the overlay has `p-4`; do not change visuals otherwise.
      Desktop must look identical (all safe-area insets are 0 on desktop).
      Files: FE\src\index.css, FE\src\App.jsx, FE\src\components\BottomNav.jsx, FE\src\components\TopAnnouncementBar.jsx and/or Navbar.jsx, NoticeModal.jsx, ConfirmationModal.jsx
      Verify: `npm.cmd run build`, `npm.cmd run lint` (≤14 warnings, 0 errors). Built CSS in `dist\assets\*.css` contains `safe-area-inset-bottom`.

- [ ] 12. Offline states in pages (depends on 6).
      In each of `FE\src\pages\Feed.jsx`, `RoadStatus.jsx`, `RideDetails.jsx`, `MyRides.jsx`: read the fetch function; in its catch set `setOffline(isNetworkError(err))` (new state, reset to false at fetch start). When `offline` true, render in place of the list/detail an alert box (`role="alert"`): "You appear to be offline — can't load current rides." (RoadStatus: "…current road info."; RideDetails: "…this ride.") with a `Retry` button calling the existing fetch function. Clear previously loaded data on network failure (`setRides([])` etc.) so no stale list shows beside the message. Don't alter non-network error handling. If the fetch is defined inside useEffect, lift it into a `useCallback` so Retry can call it (keep deps correct to avoid new lint warnings).
      Files: the four page files
      Verify: `npm.cmd run build`, `npm.cmd test`, `npm.cmd run lint` (no new warnings).

- [ ] 13. Vercel headers.
      `FE\vercel.json`: keep `rewrites` as-is; add `headers`: for each of `/sw.js`, `/registerSW.js`, `/manifest.webmanifest`, `/workbox-(.*).js` → `Cache-Control: public, max-age=0, must-revalidate` plus `no-cache` (use value `no-cache`); `/assets/(.*)` → `public, max-age=31536000, immutable`.
      Files: FE\vercel.json
      Verify: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` succeeds; rewrites unchanged.

- [ ] 14. README.
      Replace Vite boilerplate in `FE\README.md` with project frontend docs: dev/build/test/lint commands (npm.cmd note); PWA section: features; files added/changed; deps + exact versions; manifest values; icon files/sizes and how to regenerate (`npm.cmd run generate-pwa-assets` from `public/logo.svg`); SW behavior (precache app shell, navigateFallback, NetworkOnly for API, no API/non-GET caching, prompt update flow — Reload/Later, never auto-reload); offline limitations (shell loads, data does not; banner + per-page retry); install steps Android Chrome and iPhone Safari; iOS limitations (no beforeinstallprompt, separate storage → login again after install, possible storage eviction, push not in scope); deploy via existing Vercel project (headers in vercel.json); troubleshooting (stale SW: unregister in DevTools > Application, hard reload; icons not updating; testing via `npm.cmd run build && npm.cmd run preview`); security note on localStorage token XSS risk; PWA install vs app-store publishing distinction.
      Files: FE\README.md
      Verify: file renders as markdown; no duplicate sections.

- [ ] 15. Final verification.
      From FE: `npm.cmd run build` (check dist has sw.js, manifest.webmanifest, five PNGs, logo.svg), `npm.cmd test` (all pass), `npm.cmd run lint` (0 errors, ≤14 warnings). Inspect `dist\sw.js` for no API caching. Run `git -C d:\Mubashir\carpooling\carpooling status` and confirm changes are only under `frontend\` (and `.agents\`), nothing under `backend\`; do not commit. Remove any temp files. Report manual device checks (Android install, iOS Add to Home Screen, offline toggle in DevTools, Lighthouse) as not performed.

## Notes / assumptions
- Orientation omitted (rotation allowed).
- `tailwind.config.js` left untouched (likely unused under Tailwind v4).
- If `@vite-pwa/assets-generator` fails to install sharp on Windows, report the blocker rather than hand-drawing PNGs.
