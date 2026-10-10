# Hackathon Spec: Twin Cities Community Mobility (Islamabad Hack 2026)

Track: Community & Society (primary) · Climate & Sustainability (supporting)

## 1. Problem & relevance

Islamabad and Rawalpindi function as one metro area. Hundreds of thousands of people commute daily between Rawalpindi (Saddar, Commercial Market, Faizabad) and Islamabad (Blue Area, F/G sectors, H-11/H-12 universities).

- Fuel inflation: repeated petrol price increases have pushed a solo ride-hailing trip on common corridors past PKR 1,000, a large share of a student's or junior employee's daily budget.
- Transit gaps: the Metrobus covers one spine (Saddar to Pak Secretariat plus the airport/Peshawar Mor feeders). Campuses like NUST (H-12), FAST (H-11) and COMSATS (Park Road), and suburbs like Bahria Town and DHA, rely on private cars, vans or expensive taxis.
- Route disruption: protests, VIP movement and container blockades close Faizabad, Srinagar Highway, the Expressway or M-1/M-2 at short notice. Commuters hear about it through scattered WhatsApp forwards with no timestamp or source.
- Empty seats: most private cars on these corridors carry one person. Every empty seat wastes fuel and adds CO₂.

The app connects drivers with empty seats to commuters through WhatsApp, and publishes admin-curated road status. This iteration adds three enhancements that make the impact visible and the app easier for local users.

## 2. Zero-cost architecture

| Layer | Choice | Cost |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind v4, hosted on Vercel | $0 |
| Backend | Express 4 serverless on Vercel (`backend/server.js` exports `app`) | $0 |
| Database | MongoDB Atlas M0 with cached connection (`backend/config/db.js`) | $0 |
| Maps/distances | Static corridor table in `frontend/src/utils/impactCalculator.js` (no Google Maps Platform) | $0 |
| NLP | Local rule-based parser in `frontend/src/utils/nlpSearchParser.js` (no external AI/NLP API) | $0 |
| Contact | WhatsApp deep links `https://wa.me/923…` | $0 |

Nothing requires a credit or debit card.

### Preserved production invariants

| Invariant | Location | Status |
|---|---|---|
| Custom JWT auth, bcryptjs 10 rounds, 30-day token | `models/User.js`, `utils/generateToken.js` | Unchanged, asserted by tests |
| Atlas M0 connection caching | `config/db.js` | Unchanged |
| TTL auto-purge on `expiresAt` (departure + 15 min) | `models/Ride.js`, `utils/dateHelpers.js` | Unchanged, asserted by tests |
| Dynamic CORS regex / `getBaseURL()` | `server.js`, `frontend/src/services/api.js` | Unchanged (server.js only gains a `NODE_ENV !== 'test'` listen guard) |
| WhatsApp deep link + guest number masking | `controllers/rideController.js` | Unchanged, asserted by tests |
| Road Status admin gatekeeping + CLOSED → RESTRICTED → OPEN sort | `routes/roadStatusRoutes.js`, `controllers/roadStatusController.js` | Unchanged; one additive `verified` field |

## 3. Enhancement specs

### 3.1 Commute Economics Engine

File: `frontend/src/utils/impactCalculator.js`. UI: `components/CommuteImpactBadge.jsx` (ride cards) and `components/CommuteImpactBreakdown.jsx` (ride details, above the safety notice).

`calculateRideImpact(pickup, destination, pricePerSeat, seats = 1)` returns `{ soloEstimate, passengerSavings, co2KgSaved, distanceKm, isIntercity, corridorLabel }`.

| Quantity | Formula |
|---|---|
| Solo fare estimate | `Math.max(350, Math.round(distanceKm * 65))` (PKR 65/km, PKR 350 minimum) |
| Passenger savings | `Math.max(0, soloEstimate - pricePerSeat)` (clamped so it never shows negative) |
| CO₂ prevented | `Math.round((distanceKm * 0.171 * seats) * 10) / 10` kg (0.171 kg CO₂ per passenger-km, petrol car) |

Corridor table (case-insensitive alias match on pickup/destination, either direction, checked in this order):

| Corridor | Distance |
|---|---|
| Intercity / motorway (Peshawar, Lahore, M-1, M-2, Murree, Abbottabad, …) | 120 km, `isIntercity: true` |
| Rawalpindi / Faizabad ↔ COMSATS (Park Road) | 12 km |
| Rawalpindi / Saddar ↔ NUST (H-12) | 22 km |
| Islamabad F-sectors ↔ FAST / CFD (H-11) | 14 km |
| Rawalpindi / Saddar ↔ Islamabad / Blue Area | 18 km |
| Any other Twin Cities pair | 15 km |

Sector spellings are normalised (`H12`, `h 12` → `h-12`). Non-numeric prices count as 0 and invalid seat counts as 1, so the UI never crashes on bad data. Example: Saddar → Blue Area at PKR 200/seat gives a solo estimate of PKR 1,170, PKR 970 saved and 3.1 kg CO₂.

The breakdown card shows the assumptions in plain text: the per-km rate, the minimum fare, the emissions factor, and that distances are corridor estimates, not GPS measurements.

### 3.2 Roman Urdu & natural-language ride search

File: `frontend/src/utils/nlpSearchParser.js`, integrated in `frontend/src/pages/Feed.jsx`.

`parseCommuteQuery(rawQuery, now = new Date())` returns `{ cleanKeyword, targetDateTab, customDate, timeOfDay, parsedLocations, hasTokens }`.

| Intent | Keywords | Result |
|---|---|---|
| Date | `parso`, `day after tomorrow` (checked first) | `targetDateTab: 'custom'`, `customDate` = local YYYY-MM-DD for today + 2 |
| Date | `kal`, `tomorrow` | `'tomorrow'` |
| Date | `aaj`, `today` | `'today'` |
| Time | `subah`, `morning`, `am` | `'morning'` 06:00–12:00 |
| Time | `dopahar`, `afternoon` | `'afternoon'` 12:00–17:00 |
| Time | `sham`, `shaam`, `raat`, `evening`, `night`, `pm` | `'evening'` 17:00–23:59 |

`am`/`pm` only match as standalone tokens or after a number (`8am`), never inside words like "name".

| Landmark label | Aliases |
|---|---|
| NUST H-12 | nust, h-12 |
| FAST H-11 | fast, h-11, cfd |
| COMSATS Park Road | comsats, park road |
| Blue Area | blue area, f-6, f-7, g-7, g-8 |
| Rawalpindi | saddar, pindi, rawalpindi, commercial market, rwp |
| Faizabad | faizabad, i-8 |
| Bahria Town / DHA | bahria, pwd, dha |
| Islamabad | islamabad, isb (ride text matches any Islamabad sector or campus) |

Filler words (`se`, `ko`, `jana`, `hai`, `to`, `from`, `university`, …) are dropped; whatever is left becomes `cleanKeyword`.

| Query | Output |
|---|---|
| `kal subah nust jana hai` | tomorrow · morning · [NUST H-12] |
| `rawalpindi to blue area evening` | evening · [Rawalpindi, Blue Area] |
| `sham ko fast university` | evening · [FAST H-11] |
| `parso pindi se islamabad` | custom (today + 2) · [Rawalpindi, Islamabad] |

Feed behaviour:
- Date intents switch the Today/Tomorrow tab, or set the custom date for `parso`. Switching only happens when the detected intent changes, so a manual tab click still wins.
- Rides must match every detected landmark (pickup or destination), the time window (`departureTime` is `HH:mm`), and any `cleanKeyword`.
- Queries with no detected tokens keep the original substring search.
- A pill under the search box (`role="status"`) reads e.g. "🎯 Detected: Tomorrow | Morning | NUST H-12" with an "× Clear" button that resets the search and the NLP-selected date.

### 3.3 Verified Road Freshness

Files: `frontend/src/pages/RoadStatus.jsx`, `frontend/src/utils/dateUtils.js`, `backend/controllers/roadStatusController.js`.

- Relative time: `getRelativeTimeLabel(updatedAt)` gives "Updated just now" (under 1 min), "Updated N minutes ago", "Updated N hours ago" or "Updated N days ago". It refreshes every 60 s and the absolute timestamp stays visible.
- Stale alert: when `updatedAt` is more than 12 hours old (`isOlderThanHours(updatedAt, 12)`), the card shows the amber "⚠️ Status may be dated — verify locally".
- Verified badge: `GET /api/road-status` now returns an extra computed boolean `verified`. The controller populates `updatedBy` (`role email`) and sets `verified` when the author's role is `admin` or their email matches `ADMIN_EMAIL`. The same rule is used by `adminOnly`. Every create/update is admin-gated and stamps `updatedBy`, so new entries are verified. Legacy records with no `updatedBy` get no badge. Author id and email are never sent to clients. Verified cards show the emerald "✓ Verified Highway/Traffic Update".
- Quick filter: an "All Roads" / "Disrupted Only (Closed/Restricted)" toggle (`aria-pressed`) hides OPEN roads in the browser. The server's CLOSED → RESTRICTED → OPEN order is kept because the list is only filtered, never re-sorted.

## 4. Testing evidence

| Suite | Command | Coverage |
|---|---|---|
| Backend API (jest + supertest + mongodb-memory-server-core) | `cd backend && npm test` | Register/login, bcrypt 10 rounds, 30-day JWT, `/api/auth/me` with valid, missing and malformed tokens; ride creation, guest feed with no phone numbers, guest/invalid-token masking on details, authenticated `wa.me/923…` link; TTL `expiresAt = departure + 15 min` and the `{ expiresAt: 1 }` index with `expireAfterSeconds: 0`; road status 401/403 gatekeeping, CLOSED → RESTRICTED → OPEN sort, `verified` flag, category filter |
| Frontend utils (node:test) | `cd frontend && npm test` | Corridor distances, fares, savings clamp, CO₂ per seat; the four sample queries, date/time/landmark detection, time-window boundaries, relative-time labels |

Backend tests start an in-memory MongoDB on `127.0.0.1`, set `MONGO_URI` before `server.js` loads, and refuse to run against any non-local URI. They never touch Atlas. `server.js` skips `app.listen` only when `NODE_ENV === 'test'`.

## 5. How Kiro was used

1. Spec: this document defines the problem, formulas, keyword grammar and invariants.
2. Plan: Kiro inspected the real code (endpoint paths, response shapes, field names) and wrote a step-by-step plan, with an invariant safety table, before any edit.
3. Implement: each step was built against the plan, with automated tests for the backend API and the pure frontend utilities.
4. Review loop: a review step checks the diff against this spec and the invariants, and its findings go back into implementation until the suites pass.
