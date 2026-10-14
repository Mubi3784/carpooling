# Carpooling – Frontend

React 19 + Vite 8 + Tailwind 4 single-page app, deployed on Vercel. It is also an installable Progressive Web App (PWA).

## Commands

On Windows PowerShell use `npm.cmd` (the `npm.ps1` shim may be blocked by execution policy).

| Task | Command |
| --- | --- |
| Dev server | `npm.cmd run dev` |
| Production build | `npm.cmd run build` |
| Preview the build (with service worker) | `npm.cmd run preview` |
| Unit tests (`node:test`) | `npm.cmd test` |
| Lint (oxlint) | `npm.cmd run lint` |
| Regenerate PWA icons | `npm.cmd run generate-pwa-assets` |

The API base URL comes from `VITE_API_URL` (see `src/services/api.js`).

## PWA

### Features
- Installable on Android/Chromium (in-app "Install" card) and iPhone/iPad (Share → Add to Home Screen instructions).
- App shell (HTML/JS/CSS/icons) is precached, so the app opens without a connection.
- Live data only: rides, ride details, My Rides and road status are never cached. When offline, an amber banner appears and each page shows "You appear to be offline — can't load …" with a Retry button instead of an empty or stale list.
- "New version available" toast with Reload / Later. The app never reloads on its own.
- Safe-area support for notched phones; rotation is allowed (no `orientation` lock).

### Files
- `vite.config.js` – `VitePWA` plugin config (manifest + Workbox).
- `pwa-assets.config.js` – icon generator config (`minimal2023Preset`).
- `public/logo.svg` – source logo (white car + two riders on `#059669`); `public/favicon.svg` is a copy.
- `src/components/UpdatePrompt.jsx` – service-worker registration and update toast.
- `src/components/InstallPrompt.jsx` – install card / iOS instructions.
- `src/components/OfflineBanner.jsx`, `src/hooks/useOnlineStatus.js` – offline banner.
- `src/components/OfflineNotice.jsx`, `src/utils/networkError.js` – per-page offline state (`isNetworkError`, `isAuthError`; tested in `tests/networkError.test.js`).
- `src/context/AuthContext.jsx` – session is cleared only on 401/403 from `/auth/me`, not on network errors.
- `src/services/api.js` – 401 response interceptor removes the stored token (no redirect, no retry).
- `src/index.css` – `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, `pb-nav-safe` utilities; used in `App.jsx` and `BottomNav.jsx`. Modals get `max-h` + scrolling on small screens.
- `index.html` – title, viewport-fit, theme-color, Apple meta tags, icons.
- `vercel.json` – SPA rewrite plus cache headers.

### Dependencies (dev, pinned)
- `vite-plugin-pwa` 2.0.0 (Workbox `generateSW`)
- `@vite-pwa/assets-generator` 2.0.0 (uses `sharp`)

### Manifest
`name` Carpooling, `short_name` Carpool, `start_url` `/`, `scope` `/`, `display` standalone, `theme_color` `#059669`, `background_color` `#F8FAFC`, no orientation lock. The manifest is generated as `dist/manifest.webmanifest` and linked automatically.

### Icons
Generated into `public/` from `public/logo.svg`:

| File | Size | Purpose |
| --- | --- | --- |
| `pwa-64x64.png` | 64×64 | any |
| `pwa-192x192.png` | 192×192 | any |
| `pwa-512x512.png` | 512×512 | any |
| `maskable-icon-512x512.png` | 512×512 | maskable (artwork inside the safe zone) |
| `apple-touch-icon-180x180.png` | 180×180 | iOS home screen |
| `favicon.ico` | 48×48 | legacy favicon |

To change the logo, edit `public/logo.svg`, copy it over `public/favicon.svg`, run `npm.cmd run generate-pwa-assets`, and rebuild.

### Service worker and caching rules
- Registered by `UpdatePrompt` (`registerType: 'prompt'`, `injectRegister: false`).
- Precache: `**/*.{js,css,html,svg,png,ico,webmanifest}`; old precaches are removed (`cleanupOutdatedCaches`).
- Navigations fall back to `/index.html` (SPA routes work offline), except `/api/*`.
- `NetworkOnly` for any `/api/` path and for the `VITE_API_URL` origin. No API response is ever cached, and Workbox never caches non-GET requests.
- Service worker is disabled in `npm run dev`; test with `build` + `preview`.

### Update flow
A new deploy produces a new `sw.js`. Open tabs show "New version available": **Reload** activates the new worker and reloads; **Later** hides the toast and the update applies when all app tabs are closed.

### Offline limitations
Only the app shell works offline. Rides, ride details, My Rides, road status, login, posting and editing all need a connection. The app does not show cached or "last updated" data.

### Install on Android (Chrome / Edge / Samsung Internet)
1. Open the site in the browser.
2. Tap **Install** on the "Install Carpooling" card, or use the browser menu → **Install app** / **Add to Home screen**.
3. Launch from the home screen; it opens without browser UI.

"Not now" hides the card for 14 days.

### Install on iPhone / iPad (Safari)
1. Open the site in **Safari** (other iOS browsers may not offer this).
2. Tap the **Share** button.
3. Choose **Add to Home Screen**, then **Add**.

### iOS limitations
- No `beforeinstallprompt`; the app can only show instructions, and cannot detect installation from Safari.
- The installed app has its **own storage**, separate from Safari: users must **log in again** after installing.
- iOS may evict storage (including the login token and service-worker caches) for apps not used for a while.
- Push notifications are not part of this setup.

### Deploy
Use the existing Vercel project; no extra service. `vercel.json` sets `Cache-Control: no-cache` for `/sw.js`, `/registerSW.js`, `/manifest.webmanifest` and `/workbox-*.js` so updates are picked up, and `public, max-age=31536000, immutable` for hashed `/assets/*`. PWAs require HTTPS (Vercel provides it; `localhost` is also allowed).

### Troubleshooting
- **Old version keeps loading:** DevTools → Application → Service workers → Unregister, then clear site data and hard reload.
- **Icons not updating on the home screen:** remove and reinstall the app; launchers cache icons.
- **No install card:** Chromium only fires `beforeinstallprompt` on HTTPS, with a valid manifest, when not already installed, and not within 14 days of "Not now" (clear `carpool_install_dismissed_at` in localStorage to reset).
- **Testing locally:** `npm.cmd run build` then `npm.cmd run preview`; use DevTools → Network → Offline to see offline states.

### Security note
The JWT is stored in `localStorage` (`carpool_token`). Any XSS on the origin can read it; keep dependencies updated and never render untrusted HTML. The service worker does not cache API responses, so tokens and user data are not written to Cache Storage.

### PWA vs app stores
Installing the PWA adds a home-screen app straight from the website. It is not a Play Store / App Store listing; publishing there would need a separate wrapper (e.g. TWA or a native shell), store accounts and review, which are out of scope.
