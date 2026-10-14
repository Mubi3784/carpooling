# Installable PWA shell for the Carpooling frontend (live data only)

The change makes the Vite/React frontend installable: vite-plugin-pwa 2.0.0 (pinned) generates a manifest and a Workbox service worker that precaches only the built app shell, an original logo and generated icon set are added, and new UI components handle update prompts, install suggestions, and offline state. API traffic goes through `NetworkOnly` routes, so no ride or WhatsApp data is cached anywhere. AuthContext no longer logs users out when `/auth/me` fails for network reasons. Four pages now show an explicit offline state with Retry.

Watch for: a new axios 401 interceptor silently removes the token without updating React auth state (likely, non-blocking); `isNetworkError` treats any error without a response as "offline", including client-side exceptions (likely, minor); the top safe-area inset sits on a non-sticky wrapper, which the coder already flagged.

**Verdict**: APPROVED

## High-level view

The service worker precaches only build assets (`js,css,html,svg,png,ico,webmanifest`). Navigations fall back to `/index.html`, with `/api/` excluded from the fallback. Same-origin `/api/` GETs and GETs to the build-time `VITE_API_URL` origin are routed to `NetworkOnly`. Non-GET requests have no route, so they go straight to the network. No caching strategy appears anywhere in the config or (per the report's dist inspection) in `sw.js`, which satisfies the live-data-only decision and keeps private WhatsApp numbers out of caches.

Manifest and meta tags match the user's choices: theme `#059669`, background `#F8FAFC`, name/short_name, standalone, and no orientation lock, so rotation is allowed. The icons are any + maskable from an original logo. `registerType: 'prompt'` with `injectRegister: false` and a manual `useRegisterSW` in UpdatePrompt means the app never reloads on its own. InstallPrompt gates on `beforeinstallprompt`, shows Share instructions on iOS Safari, hides in standalone mode, and remembers a dismiss for 14 days.

The audit's biggest risk is handled: `/auth/me` now calls `logout()` only for 401/403, and other failures keep the token. A separate global 401 interceptor was also added. It clears storage without touching context state.

vercel.json adds no-cache headers for the SW, registerSW, manifest and workbox files, and immutable caching for `/assets`. No backend changes, nothing committed. Verification evidence is complete: build, 28/28 tests, lint at baseline, dist route inspection, secret grep, and a preview smoke test.

<details>
<summary>Issues (3)</summary>

1. **Interceptor/context desync on 401**: the global interceptor removes `carpool_token` on any non-auth-form 401, but `user` stays set in AuthContext, so the UI looks logged in until a reload. Either call the context's logout from a shared hook or remove the interceptor, since `/auth/me` already handles expiry. Non-blocking.
2. **Over-broad offline classification**: `isNetworkError` returns true for any error without `response`, so a runtime TypeError in a page's `then` path shows "You appear to be offline". Consider checking `err.isAxiosError` (or `err.request`) as well. Non-blocking.
3. **Sticky navbar vs top inset**: the coder already reported that the inset is on a non-sticky wrapper, so the Navbar can slide under a notch after scrolling if the device reports a top inset. Verify on a real device. Non-blocking.

</details>

<details>
<summary>Details</summary>

### NetworkOnly API routing and the WhatsApp-number constraint

The live-data-only rule holds (confirmed in `vite.config.js`). `runtimeCaching` contains only `NetworkOnly` handlers, and the origin rule is a build-time RegExp. That choice fixed a real serialization bug the coder caught, where a closure referenced an undefined `apiOrigin` inside `sw.js`. If `VITE_API_URL` is unset or points to another origin at Vercel build time, cross-origin requests have no SW route, and Workbox then does not intercept them at all. So the failure mode is still "not cached", never "cached". `navigateFallbackDenylist: [/^\/api\//]` stops API navigations from being answered with the shell.

### Session retention and the new 401 interceptor

`isAuthError` limits logout to 401/403 from `/auth/me` (confirmed). 5xx, timeouts and offline all keep the session. That matches the plan, though it means a persistently broken backend leaves a user "logged in" with failing pages. The new response interceptor in `api.js` (likely issue) removes the token on any 401 except login/register, but it cannot reach `setUser`. After a 401 from, say, a ride-join call, the next request goes out unauthenticated while the navbar still shows the user. It does not loop or redirect, so the risk is confusing UX, not a security hole.

### Offline states on pages

Feed and RideDetails (read in the diff) clear stale data and render `OfflineNotice` with Retry. RideDetails retries via a `retryKey` effect dependency. The private ride data is dropped from state on a network error rather than left on screen. The classification gap from Issue 2 applies here: `!err.response` also matches non-axios errors. The 7 new node:test cases cover the helper. Not tested: page-level offline rendering, the update-prompt flow, and real install flows (the report states that no browser automation or devices were available).

</details>

<details>
<summary>File map</summary>

- `frontend/vite.config.js`: VitePWA config, manifest, Workbox NetworkOnly routes
- `frontend/index.html`: icons, theme-color, apple meta, viewport-fit, title
- `frontend/vercel.json`: SW/manifest no-cache, immutable assets
- `frontend/src/context/AuthContext.jsx`: logout only on 401/403
- `frontend/src/services/api.js`: global 401 token-clearing interceptor
- `frontend/src/utils/networkError.js`, `tests/networkError.test.js`: error classifiers + tests
- `frontend/src/components/{UpdatePrompt,InstallPrompt,OfflineBanner,OfflineNotice}.jsx`, `src/hooks/useOnlineStatus.js`: PWA UI
- `frontend/src/App.jsx`, `index.css`, `BottomNav`, modals: safe-area utilities, mounts
- `frontend/src/pages/{Feed,RoadStatus,RideDetails,MyRides}.jsx`: offline state + Retry
- `frontend/public/*`, `pwa-assets.config.js`: logo and generated icons
- `frontend/package.json`/lock, `README.md`: pinned deps, script, docs

Full diff: `git diff` in `d:\Mubashir\carpooling\carpooling`.
</details>
