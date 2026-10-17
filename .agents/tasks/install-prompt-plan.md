# Implementation Plan: Persistent "Get the App" install experience

Frontend root: `d:\Mubashir\carpooling\carpooling\frontend` (all paths below relative to it). Use `npm.cmd`. Do NOT commit/push/deploy; do not touch `backend/` or `vite.config.js`; preserve all uncommitted PWA work (manifest, SW, UpdatePrompt, OfflineBanner, icons).

## Findings from exploration (drive the decisions)
- Existing `src/components/InstallPrompt.jsx` holds the root-cause bugs (14-day hide key `carpool_install_dismissed_at`, listener attached in `useEffect`, returns null without event, `userChoice` ignored, iOS check excludes CriOS/FxiOS/EdgiOS). Mounted in `src/App.jsx`.
- Route `/` renders `pages/Feed.jsx`; `pages/Home.jsx` is NOT routed (a static hero). Decision: build the section as a reusable `InstallSection` component, mount it in `Feed.jsx` (the real home page, below the page header, above the list), and also in `Home.jsx` (cheap, keeps the requirement literal).
- Layout: `Navbar` = `header sticky top-0 z-40`, inner `h-16`; right group is `div.flex.items-center.gap-3` holding Login/Register (px-4 py-2). `BottomNav` = `md:hidden fixed bottom-0 z-40`, `h-14` + `pb-safe`. `UpdatePrompt` = `fixed z-50 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4`. `App` root has `pb-nav-safe md:pb-0 pl-safe pr-safe`. `index.css` has `pt-safe/pb-safe/pl-safe/pr-safe/pb-nav-safe` utilities.
- Tests: `tests/*.test.js` via `node --test` (existing: impactCalculator, networkError, nlpSearchParser). Lint = `oxlint`. No React test runner exists; do not add one.
- `main.jsx` renders StrictMode > BrowserRouter > AuthProvider > App.

## Decisions
1. QR library: `qrcode-generator` (zero deps, MIT, pure JS, offline, no network). Render with its `createSvgTag`/`createDataURL` as inline SVG/`<img>` data URL with alt text. Fallback only if it fails build/lint/ESM import: `qrcode-svg`, pinned; explain in report.
2. Banner placement: in normal flow, `sticky top-16 z-30 md:hidden`, rendered directly after `<Navbar />` in `App.jsx`. It pins under the navbar, takes layout space (so it cannot cover content, BottomNav, UpdatePrompt, or OfflineBanner, which live above the navbar or fixed at bottom z-40/50). Rejected: fixed-above-BottomNav (collides with UpdatePrompt at bottom-[4.5rem]).
3. Dialog is rendered via `createPortal` to `document.body`, `z-50` (above header/BottomNav z-40; UpdatePrompt is z-50 too but DOM order later in body keeps dialog backdrop acceptable; dialog uses `z-[60]` to be strictly above it).
4. Leaving `useInstallPrompt` snapshot stable: store keeps one immutable snapshot object, replaced only on change.

## Steps

- [ ] 0. Baseline (before any change).
      Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build`; record warning/error counts and test pass count in `.agents/tasks/install-prompt-report.md` (baseline section). Also `git status --short` to snapshot the uncommitted PWA files.
      Verify: commands complete; baseline numbers written down.

- [ ] 1. Pin the QR dependency.
      Run `npm.cmd view qrcode-generator version license dependencies dist.unpacked-size` (confirm MIT, no deps). Then `npm.cmd install --save-exact qrcode-generator@<that exact version>`. Confirm `package.json` shows no `^`/`~` for it and only `package.json`/`package-lock.json` changed.
      Files: `package.json`, `package-lock.json`
      Verify: `node -e "import('qrcode-generator').then(m=>console.log(typeof m.default))"` prints `function`; `npm.cmd run build` still passes.

- [ ] 2. Create `src/lib/installPlatform.js` (pure, no DOM access at import).
      Exports: `detectPlatform({userAgent, platform, maxTouchPoints})` returning one of `ios-safari|ios-other|android-chrome|android-other|desktop-chromium|desktop-safari|desktop-firefox|in-app|other`; `getInstructions(platform)` returning `{ title, steps: string[], note? }` (iOS: Share > Add to Home Screen, ios-other mentions 16.4+; Android: browser menu > Install app / Add to Home screen; desktop-chromium: install icon in address bar or menu > Install; desktop-safari: macOS 17+ File > Add to Dock; in-app: open in Chrome/Safari via the menu; desktop-firefox: Firefox desktop cannot install PWAs, scan QR to use on phone; other: generic). `isMobilePlatform(p)` true for ios-*/android-*. Order: in-app check first (FBAN|FBAV|Instagram|WhatsApp|Line/|MicroMessenger|Snapchat|Twitter|TikTok|; Android `; wv)`), then iOS (iPhone|iPad|iPod or platform MacIntel && maxTouchPoints>1; CriOS|FxiOS|EdgiOS|OPiOS => ios-other), then Android (Chrome w/o SamsungBrowser|Firefox|OPR|EdgA => android-chrome, else android-other), then desktop (Edg/Chrome/OPR => chromium; Firefox; Safari).
      Files: `src/lib/installPlatform.js`
      Verify: covered by step 3.

- [ ] 3. Create `tests/installPlatform.test.js` (node:test + node:assert/strict).
      Cases: iPhone Safari, iPad desktop-UA (MacIntel + maxTouchPoints 5), real macOS Safari (touch 0 => desktop-safari), CriOS, EdgiOS, FxiOS, Android Chrome, Samsung Internet, Firefox Android, desktop Chrome, Edge, Safari, Firefox, Facebook (FBAN/FBAV), Instagram, WhatsApp, Line in-app UAs, empty/undefined input => `other`; `getInstructions` returns non-empty `steps` array of strings for every platform, desktop-firefox text mentions QR/phone and not "not supported" alone, no string contains "App Store" or "Google Play"; `isMobilePlatform` truth table.
      Files: `tests/installPlatform.test.js`
      Verify: `npm.cmd test` all pass (baseline + new).

- [ ] 4. Create `src/lib/installPrompt.js` module-level store.
      Guard with `typeof window !== 'undefined'` and a `window.__carpoolInstallInit` flag (idempotent for HMR/StrictMode). Registers `beforeinstallprompt` (preventDefault, store event, notify), `appinstalled` (installed=true, event=null), `matchMedia('(display-mode: standalone)')` change listener (use addEventListener with addListener fallback) plus `navigator.standalone`. Snapshot `{ canPromptNative, isInstalled }` replaced only when values change. Exports `subscribe`, `getSnapshot`, `getServerSnapshot`, `promptInstall()`: if no event => `'unavailable'`; else call `prompt()` once, await `userChoice`, clear event, return `'accepted'|'dismissed'` (try/catch => `'unavailable'`); a later re-fired `beforeinstallprompt` re-stores. Never sets installed on dismissal. Also exports `clearLegacyDismissKey()` removing `carpool_install_dismissed_at` (called once at init in try/catch). Keep the pure state transitions in small exported functions so a DOM-free node test is possible (optional `tests/installPrompt.test.js` using a fake window/event target: dismissal does not set installed, event cleared after use, same snapshot reference when unchanged).
      Files: `src/lib/installPrompt.js`, optional `tests/installPrompt.test.js`
      Verify: `npm.cmd test`; `npm.cmd run lint`.

- [ ] 5. `src/main.jsx`: add `import './lib/installPrompt.js';` as the FIRST import (before React) so the event is captured before render.
      Create `src/hooks/useInstallPrompt.js`: `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`; platform computed once via `useMemo` from `navigator`; returns `{ canPromptNative, isInstalled, platform, promptInstall }`.
      Files: `src/main.jsx`, `src/hooks/useInstallPrompt.js`
      Verify: `npm.cmd run build` succeeds; `npm.cmd run lint` no new warnings.

- [ ] 6. Create the QR component `src/components/InstallQr.jsx`.
      Uses `qrcode-generator` (type 0, level 'M') to encode `window.location.origin`, renders inline `<svg>` via `createSvgTag({cellSize, margin, scalable:true})` as `<img src=dataURL alt="QR code to open Carpooling at <origin>">` (prefer data URL img for simple alt); `useMemo`, white quiet-zone background, fixed size (e.g. w-40 h-40).
      Files: `src/components/InstallQr.jsx`
      Verify: `npm.cmd run build`; dev/preview page shows scannable QR.

- [ ] 7. Create `src/components/InstallDialog.jsx` and `src/components/InstallButton.jsx`.
      Dialog props `{ open, onClose, platform, canPromptNative, note }`. `createPortal` to body; backdrop `fixed inset-0 z-[60] bg-slate-900/60`, panel `role="dialog" aria-modal="true" aria-labelledby`, `max-h-[90dvh] overflow-auto`, `pb-[calc(1rem+env(safe-area-inset-bottom))]`, bottom sheet on mobile / centered on md. Focus: save `document.activeElement`, focus the close button on open, trap Tab/Shift+Tab, Escape and backdrop click close, restore focus on close, lock body scroll while open. Content: heading "Get the App"; honest copy ("Carpooling installs from your browser; it is not in an app store"); `getInstructions(platform)` steps; on desktop platforms (not mobile, not in-app) also render `InstallQr` with text "Scan with your phone camera to open Carpooling, then choose Add to Home Screen / Install" and desktop steps when chromium/safari; desktop-firefox shows QR flow with explanation that Firefox desktop cannot install, no dead-end. NO store badges.
      Button: shared hook `useInstallAction()` (put in `useInstallPrompt.js` or `InstallButton.jsx` export) — on click: if `canPromptNative` => `await promptInstall()`; `'dismissed'` => set gentle note ("No problem. You can install any time from this button.") and set `fallbackNext` so the next click opens the dialog; `'accepted'` => nothing (appinstalled/standalone hides); else open dialog. Not canPromptNative => open dialog. `InstallButton` props: `variant` ('navbar'|'banner'|'section'), renders null when `isInstalled`; includes `<InstallDialog>`. Export the click hook so the banner reuses the identical handler.
      Files: `src/components/InstallDialog.jsx`, `src/components/InstallButton.jsx`
      Verify: `npm.cmd run build`, `npm.cmd run lint`.

- [ ] 8. Navbar CTA in `src/components/Navbar.jsx`.
      Add `<InstallButton variant="navbar" />` at the start of the right group (before auth controls, for both auth states). Classes: `inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 px-3 sm:px-4 rounded-xl bg-emerald-600 text-white font-semibold text-sm shadow-sm hover:bg-emerald-700 focus-visible:outline-2 ...`; `Download` (lucide) icon with `aria-hidden`, label `<span className="hidden sm:inline">Get the App</span>` plus `aria-label="Get the App"` on the button. At 320px reduce right-group gap (`gap-1 sm:gap-3`) and shrink Login link padding below sm (`px-2 sm:px-4`) so logo + CTA + Login + Register fit; check for horizontal overflow.
      Files: `src/components/Navbar.jsx`
      Verify: build; manual at 320/375/768/1280 widths (see checklist).

- [ ] 9. Mobile banner `src/components/InstallBanner.jsx`, mounted once in `App.jsx`.
      Show only when `isMobilePlatform(platform) || platform==='in-app'`, `!isInstalled`, and banner not dismissed (key `carpool_install_banner_dismissed_at`, 14 days, try/catch storage, read once in state initializer). in-app variant: text "Open in Chrome or Safari to install Carpooling" (button opens dialog with in-app instructions). Layout `sticky top-16 z-30 md:hidden`, slim (`py-2 px-3`), emerald-50 bg, text + "Get the App" button (same click hook as InstallButton) + close `X` (`aria-label="Dismiss install banner"`, 44px target). Dismissal sets only this key; navbar and section unaffected. In `App.jsx`: remove `InstallPrompt` import/usage, add `<InstallBanner />` right after `<Navbar />`; keep `<UpdatePrompt />`.
      Files: `src/components/InstallBanner.jsx`, `src/App.jsx`
      Verify: build; with DevTools mobile emulation the banner pins under navbar, BottomNav and UpdatePrompt remain uncovered.

- [ ] 10. Home section: `src/components/InstallSection.jsx` and mount.
      `<section aria-labelledby="install-section-heading">` card matching emerald/slate (`bg-emerald-50 border border-emerald-100 rounded-2xl p-5`), hidden when installed. Desktop (`hidden md:flex`): `InstallQr` + short text + `InstallButton variant="section"`. Mobile (`md:hidden`): short benefits list (faster launch, home-screen icon, full-screen) + button. Mount in `src/pages/Feed.jsx` below the header block (read the file's structure first, keep margins consistent with `CommuteImpactBreakdown`), and in `src/pages/Home.jsx` below the hero card.
      Files: `src/components/InstallSection.jsx`, `src/pages/Feed.jsx`, `src/pages/Home.jsx`
      Verify: build; visual check at mobile and desktop widths; section does not shift Feed data logic.

- [ ] 11. Delete old prompt and legacy key.
      Delete `src/components/InstallPrompt.jsx`. Confirm no remaining reference to `InstallPrompt` or `carpool_install_dismissed_at` other than the one-time legacy clear in `installPrompt.js` (use grep in `src/` and `README.md`).
      Verify: `npm.cmd run build` and `npm.cmd run lint` pass.

- [ ] 12. Optional trivial fixes (only if each is covered by an added test; otherwise leave and note in report).
      a) `src/utils/networkError.js`: require `err.isAxiosError || err.request` in addition to no `response`; extend `tests/networkError.test.js` with a plain `Error` case. b) `src/services/api.js` 401 interceptor / AuthContext sync: SKIP unless a one-line event dispatch is trivial; otherwise note in report as follow-up.
      Verify: `npm.cmd test`.

- [ ] 13. Update `README.md` PWA install section (existing doc only; no new docs files).
      Document: new files (lib/installPrompt.js, lib/installPlatform.js, hook, InstallButton/Dialog/Banner/Section/Qr), behavior of button/dialog/banner/section, why browsers control the native prompt (never guaranteed), per-platform instructions, QR encodes the site origin (opens site on phone; PWA install happens there; no store badges), dismissal rules (banner only, 14 days, key `carpool_install_banner_dismissed_at`; navbar and home section always shown unless installed), troubleshooting (Chrome withholds prompt after repeated dismissals/engagement heuristics, iOS needs Safari or 16.4+ Share, in-app browsers cannot install, HTTPS required), testing checklist split automated vs physical device.
      Files: `README.md`
      Verify: read-through for accuracy against implementation.

- [ ] 14. Final verification.
      - `npm.cmd run lint`: no more warnings/errors than baseline (step 0).
      - `npm.cmd test`: all pass (baseline + new).
      - `npm.cmd run build`: succeeds; check `dist/` has `manifest.webmanifest`, `sw.js`, icons; `dist/assets/*.js` contains the strings "Get the App" and no "Install App"; no "App Store"/"Google Play" in `src/` UI copy.
      - `npm.cmd run preview` (background) and fetch `/` => 200, then stop the process; no network calls for QR (grep bundle for external URLs from the QR lib: none).
      - a11y/stacking review by reading code: dialog role/aria-modal/aria-labelledby, focus trap, Escape, backdrop, focus restore, close/X labels, 44px targets, dialog z-[60] > UpdatePrompt z-50 > header/BottomNav z-40 > banner z-30, safe-area padding on dialog bottom, banner in flow so no overlap, `md:hidden` banner.
      - `git status --short`: only intended files changed; `backend/` and `vite.config.js` untouched; nothing committed.
      - Requires physical device (list in README, not claimed verified): Android Chrome native prompt + appinstalled, iOS Safari/Chrome Add to Home Screen, Samsung Internet, in-app browser behavior, QR scan from a phone.
      - Write `.agents/tasks/install-prompt-report.md` (baseline vs final numbers, QR lib version/license, deviations, optional fixes done/skipped, Home.jsx-unrouted note).

## Review contract
Reviewer writes `d:\Mubashir\carpooling\carpooling\.agents\tasks\install-prompt-review.json` as `{"verdict":"APPROVED"|"CHANGES_REQUESTED","findings":[...]}`.
