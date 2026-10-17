# Install prompt report

## Root cause
The old `InstallPrompt.jsx` attached `beforeinstallprompt` inside `useEffect` (event could fire before mount), returned null with no event, hid itself for 14 days on any dismissal, ignored `userChoice`, and its iOS check excluded Chrome/Edge/Firefox on iOS. Result: users usually saw no way to install.

## Changes
Created: `src/lib/installPrompt.js`, `src/lib/installPlatform.js`, `src/hooks/useInstallPrompt.js` (`useInstallPrompt`, `useInstallAction`), `src/components/InstallButton.jsx`, `InstallDialog.jsx`, `InstallBanner.jsx`, `InstallSection.jsx`, `InstallQr.jsx`, `tests/installPlatform.test.js`.
Modified: `src/main.jsx` (store imported first), `src/App.jsx` (banner after Navbar; InstallPrompt removed), `src/components/Navbar.jsx` (CTA, tighter gaps/padding below sm), `src/pages/Feed.jsx` and `src/pages/Home.jsx` (InstallSection; `Home.jsx` is not routed, `/` renders Feed), `README.md`, `package.json`, `package-lock.json`.
Deleted: `src/components/InstallPrompt.jsx`.
Dependency: `qrcode-generator` 2.0.4 (exact, MIT, no dependencies, offline inline SVG data URL).

## Behavior
- Label is "Get the App". Navbar button is always shown unless installed; icon-only below `sm`, 44px target.
- Click: native prompt if captured; `dismissed` keeps the button, shows a note, event is cleared so next click opens the dialog; no native prompt opens the dialog.
- Installed only via `appinstalled` or standalone, never dismissal.
- Dialog: portal, `z-[60]`, role=dialog, aria-modal, labelled, focus trap, Escape/backdrop close, focus restore, scroll lock, `max-h-[90dvh]`, safe-area padding. Desktop shows QR (encodes site origin) and honest steps; desktop Firefox gets the QR flow. No store badges.
- Banner: mobile platforms and in-app only, `sticky top-16 z-30 md:hidden` in normal flow (cannot overlap BottomNav/UpdatePrompt/OfflineBanner), X dismisses only the banner for 14 days (`carpool_install_banner_dismissed_at`).
- Legacy key `carpool_install_dismissed_at` is cleared once on load.

## Commands and results (from `frontend/`)
- Baseline `npm.cmd run lint`: 0 errors, 14 warnings. `npm.cmd test`: 28 pass.
- After: `npm.cmd run build` succeeded. `npm.cmd test`: 37 pass, 0 fail (28 + 9 new). `npm.cmd run lint`: 14 warnings (unchanged, none new).
- `dist/` contains `manifest.webmanifest`, `sw.js`, workbox file and icons. `sw.js` still has the `/api/` navigation denylist and `/api/` NetworkOnly route. Bundle has no case-sensitive "Install App", "App Store" or "Google Play".

## Not done / manual only
- No browser automation was run. `npm run preview` was not started, so no server needs stopping. Not verified: layouts at 320/375/768/1280, banner vs BottomNav stacking, dialog focus/Escape in a browser, QR scan, synthetic `beforeinstallprompt` accept/dismiss and `appinstalled` paths. Verified only by code reading, build and unit tests.
- Physical device only: Android Chrome native prompt, iOS Add to Home Screen, Samsung Internet, in-app browsers, real Chrome install flow, production.
- No DOM-free store test was added.
- Optional fixes skipped: `isNetworkError` stricter check (existing test passes a plain Error and expects a network error, so changing it alters behavior) and the 401 interceptor/AuthContext sync.
- Navbar fit at 320px (logo + CTA + Login + Register) is untested; Login/Register padding was reduced below `sm` to help.
- `git status` was not re-checked; nothing committed, pushed or deployed. `backend/` and `vite.config.js` untouched.

## Deployment
Deploy as usual on Vercel after review; no config changes. Verify on a real Android and iPhone after deploy.
