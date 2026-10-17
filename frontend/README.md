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
- Installable via a persistent "Get the App" button (navbar + home section), a dismissible mobile banner, and a per-platform instructions dialog (see "Get the App install experience").
- App shell (HTML/JS/CSS/icons) is precached, so the app opens without a connection.
- Live data only: rides, ride details, My Rides and road status are never cached. When offline, an amber banner appears and each page shows "You appear to be offline — can't load …" with a Retry button instead of an empty or stale list.
- "New version available" toast with Reload / Later. The app never reloads on its own.
- Safe-area support for notched phones; rotation is allowed (no `orientation` lock).

### Files
- `vite.config.js` – `VitePWA` plugin config (manifest + Workbox).
- `pwa-assets.config.js` – icon generator config (`minimal2023Preset`).
- `public/logo.svg` – source logo (white car + two riders on `#059669`); `public/favicon.svg` is a copy.
- `src/components/UpdatePrompt.jsx` – service-worker registration and update toast.
- `src/lib/installPrompt.js` – module-level store (imported first in `main.jsx`) that captures `beforeinstallprompt`, `appinstalled` and standalone state.
- `src/lib/installPlatform.js` – pure `detectPlatform`, `getInstructions`, `isMobilePlatform` (tested in `tests/installPlatform.test.js`).
- `src/hooks/useInstallPrompt.js` – `useInstallPrompt` and the shared click handler `useInstallAction`.
- `src/components/InstallButton.jsx`, `InstallDialog.jsx`, `InstallBanner.jsx`, `InstallSection.jsx`, `InstallQr.jsx` – UI.
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

### Get the App install experience
- **Navbar button** ("Get the App", icon-only below `sm`): shown on every page unless the app is installed. Never hidden by any dismissal.
- **Home section** (`InstallSection`, in the Feed page and `Home.jsx`): QR + explanation on desktop, benefits + button on mobile. Hidden when installed.
- **Mobile banner** (`InstallBanner`): only on iOS/Android browsers, sticky under the navbar in normal flow (never covers the navbar, BottomNav or toasts). In in-app browsers it says to open Chrome or Safari. Close (X) hides only the banner for 14 days (`localStorage` key `carpool_install_banner_dismissed_at`). The old `carpool_install_dismissed_at` key is cleared on load.
- **Click behavior**: if the browser handed us a native install prompt, it is shown. If the user dismisses it, the button stays and shows a gentle note; the used event is gone, so the next click opens the instructions dialog (unless the browser fires a new event). With no native prompt, the dialog shows platform-specific steps.
- **Desktop dialog**: any desktop browser shows a QR code plus "Scan with your phone camera to open Carpooling, then choose Add to Home Screen / Install", and install steps for Chrome/Edge/Safari. Desktop Firefox gets the QR flow, not a dead end.
- **QR** encodes `window.location.origin` (the website), generated locally with `qrcode-generator` 2.0.4 (MIT, zero dependencies, no network). The phone opens the site and installs from there. There are no App Store / Google Play badges because this is a PWA, not a store app.
- **Honest limits**: browsers control the native prompt; it cannot be guaranteed. Installed state is set only by `appinstalled` or standalone display mode, never by dismissing.

### Install on Android (Chrome / Edge / Samsung Internet)
1. Open the site in the browser.
2. Tap **Get the App**, or use the browser menu → **Install app** / **Add to Home screen**.
3. Launch from the home screen; it opens without browser UI.

### Other platforms
- **Desktop Chrome/Edge:** address-bar install icon, or menu → Install Carpooling.
- **macOS Safari 17+:** File → Add to Dock.
- **iOS Chrome/Edge/Firefox:** Share → Add to Home Screen (iOS 16.4+).
- **Desktop Firefox:** cannot install PWAs; scan the QR code with a phone.
- **In-app browsers (Facebook, Instagram, WhatsApp, Line…):** open the link in Chrome or Safari first.

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
- **No native install prompt:** Chromium only fires `beforeinstallprompt` on HTTPS, with a valid manifest, when not already installed, and after its own engagement heuristics. Chrome may withhold it after repeated dismissals. The button then opens the instructions dialog instead. To reset the banner, clear `carpool_install_banner_dismissed_at` in localStorage.

### Install testing checklist
Automated (`npm.cmd test`): platform detection and instruction content for iPhone/iPad/Android/desktop/in-app UAs. Build checks: `dist` has `manifest.webmanifest` and `sw.js`, no API caching.

Needs a real device or browser (not covered by automated tests): Android Chrome native prompt and `appinstalled`; iOS Safari/Chrome Add to Home Screen; Samsung Internet; in-app browsers; scanning the QR from a phone; banner/dialog layout at 320/375/768/1280 px; dialog focus trap and Escape.
- **Testing locally:** `npm.cmd run build` then `npm.cmd run preview`; use DevTools → Network → Offline to see offline states.

### Security note
The JWT is stored in `localStorage` (`carpool_token`). Any XSS on the origin can read it; keep dependencies updated and never render untrusted HTML. The service worker does not cache API responses, so tokens and user data are not written to Cache Storage.

### PWA vs app stores
Installing the PWA adds a home-screen app straight from the website. It is not a Play Store / App Store listing; publishing there would need a separate wrapper (e.g. TWA or a native shell), store accounts and review, which are out of scope.
