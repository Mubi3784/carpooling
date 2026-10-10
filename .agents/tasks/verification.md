# Verification — Iteration 1 (no commit, per instructions)

## Files

Modified:
- backend/server.js — listen condition gains `process.env.NODE_ENV !== 'test' &&` + one comment line (the pre-existing blank-line diff is untouched)
- backend/controllers/roadStatusController.js — `isAdminAuthor` helper; GET populates `updatedBy` (`role email`) and adds `createdAt` + computed `verified`. The sort block, create/update/delete handlers and routes are unchanged. `updatedBy` and author emails are never emitted.
- backend/package.json, backend/package-lock.json — devDeps `jest@30.5.2`, `supertest@7.3.1`, `mongodb-memory-server-core@11.3.0` (exact pins); script `"test": "jest --runInBand"`; `jest` config (node env, 30 s timeout)
- frontend/package.json — script `"test": "node --test tests/*.test.js"` (no new deps)
- frontend/src/utils/dateUtils.js — appended `getDateStringWithOffset`, `getRelativeTimeLabel`, `isOlderThanHours` (existing functions untouched)
- frontend/src/components/RideCard.jsx — compact `CommuteImpactBadge` between the metadata row and the driver footer
- frontend/src/pages/RideDetails.jsx — `CommuteImpactBreakdown` between the Driver Card and the "Important Notice" disclaimer (contact block untouched)
- frontend/src/pages/Feed.jsx — NLP parsing, date-tab auto-switch (only when the detected intent changes), landmark/time/keyword filtering, "🎯 Detected: …" pill (`role="status"`) with "× Clear", aria-labels. The plain search path is unchanged when no tokens are detected.
- frontend/src/pages/RoadStatus.jsx — 60 s clock, relative "Updated X ago" `<time>`, amber stale (>12 h) badge, emerald verified badge, "All Roads" / "Disrupted Only (Closed/Restricted)" `aria-pressed` toggle (filter only, server sort preserved), disrupted-only empty-state text

Created:
- specs/HACKATHON_SPEC_COMMUNITY_IMPACT.md
- backend/tests/api.test.js
- frontend/src/utils/impactCalculator.js, frontend/src/utils/nlpSearchParser.js
- frontend/src/components/CommuteImpactBadge.jsx, frontend/src/components/CommuteImpactBreakdown.jsx
- frontend/tests/impactCalculator.test.js, frontend/tests/nlpSearchParser.test.js

## Commands & results

| Where | Command | Result |
|---|---|---|
| backend | `npm install --save-dev --save-exact jest@30.5.2 supertest@7.3.1 mongodb-memory-server-core@11.3.0` | OK (npm blocked install scripts for `@parcel/watcher`, `unrs-resolver`; jest runs fine without them) |
| backend | `npm test` (first run, downloads MongoDB 8.2.6 binary ~781 MB to the cache) | PASS — 1 suite, 24/24 tests, exit 0 |
| backend | `npm test` (second run, cached) | PASS — 24/24 tests, 3.1 s, exit 0, no open-handle hang; log shows `MongoDB Connected: 127.0.0.1` (in-memory, never Atlas) |
| frontend | `npm test` | 21 pass / 0 fail, exit 0 |
| frontend | `npm run lint` (oxlint) | exit 0, 0 errors, 14 warnings, all pre-existing (Feed.jsx `Calendar` unused + `fetchRides` immutability, RoadStatus.jsx 2× `fetchRoadStatuses`, plus others in untouched files). 0 warnings in new files. |
| frontend | `npm run build` | vite build succeeded (`✓ built`, 1963 modules) |

Backend tests cover: register 201 / duplicate 409 / bcrypt rounds = 10 / login 200 / wrong password 401 / JWT exp − iat = 30 days / `/api/auth/me` valid 200, no token 401, malformed 401; ride POST without token 401; ride created; guest feed has no `whatsappNumber`/`whatsappLink`; details masked for guest and for invalid token; authenticated details give `923105517386` + `https://wa.me/923105517386?text=…`; `calculateExpiration` +15 min; stored `expiresAt − departureDateTime = 15 min`; TTL index `{expiresAt:1}` with `expireAfterSeconds: 0`; admin via ADMIN_EMAIL; road POST 401 without token, 403 for non-admin; sort `['CLOSED','RESTRICTED','OPEN','OPEN']` with the newer OPEN first; `verified === true` and no `updatedBy` in output; category filter.

## Parser / calculator sanity run

I ran a temporary script `frontend/tmp-sanity.mjs` with `node tmp-sanity.mjs`, with `now = 2026-01-10 09:00`. The script has been deleted.

```
kal subah nust jana hai => {"cleanKeyword":"","targetDateTab":"tomorrow","customDate":null,"timeOfDay":"morning","parsedLocations":["NUST H-12"],"hasTokens":true}
rawalpindi to blue area evening => {"cleanKeyword":"","targetDateTab":null,"customDate":null,"timeOfDay":"evening","parsedLocations":["Rawalpindi","Blue Area"],"hasTokens":true}
sham ko fast university => {"cleanKeyword":"","targetDateTab":null,"customDate":null,"timeOfDay":"evening","parsedLocations":["FAST H-11"],"hasTokens":true}
parso pindi se islamabad => {"cleanKeyword":"","targetDateTab":"custom","customDate":"2026-01-12","timeOfDay":null,"parsedLocations":["Rawalpindi","Islamabad"],"hasTokens":true}
["Saddar, Rawalpindi","Blue Area, Islamabad",200,1] => soloEstimate 1170, passengerSavings 970, co2KgSaved 3.1, distanceKm 18, isIntercity false
["Rawalpindi","NUST H-12",250,3] => soloEstimate 1430, passengerSavings 1180, co2KgSaved 11.3, distanceKm 22
["F-10","FAST University",150,1] => soloEstimate 910, passengerSavings 760, co2KgSaved 2.4, distanceKm 14
["Faizabad","COMSATS Park Road",100,2] => soloEstimate 780, passengerSavings 680, co2KgSaved 4.1, distanceKm 12
["Islamabad","Peshawar",1500,1] => soloEstimate 7800, passengerSavings 6300, co2KgSaved 20.5, distanceKm 120, isIntercity true
["G-13","E-11",120,1] => soloEstimate 975, passengerSavings 855, co2KgSaved 2.6, distanceKm 15 (Twin Cities default)
```

## Invariants

- Zero cost: the only new packages are MIT dev tools. Distances come from a static table and parsing is local rules. No Maps or other paid API.
- JWT auth / bcrypt 10 / 30-day token / User model: not modified, and asserted by tests.
- db.js Atlas M0 caching: not modified. Tests go through `connectDB()` with an in-memory URI, which is set before `server.js` loads. The test refuses any non-`mongodb://127.0.0.1` URI.
- Ride TTL on `expiresAt`: not modified, and asserted (value + index).
- CORS regex in server.js: not modified. `getBaseURL()` in api.js: file untouched.
- WhatsApp deep link + guest masking: rideController untouched, and asserted.
- Road Status admin gatekeeping + CLOSED → RESTRICTED → OPEN sort: routes/middleware/sort untouched, and asserted. The frontend disrupted filter only filters, never re-sorts.
- Vercel/production behaviour: the listen guard only adds `NODE_ENV !== 'test'`, so every non-test environment evaluates exactly as before.
- No `.env` changes and no secret values printed. No TODO or placeholder code. Temp script and log files deleted. Nothing committed.
