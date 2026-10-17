# Backend Web Push (VAPID, subscriptions, generic notifications)

Adds zero-cost Web Push: a PushSubscription collection, authenticated subscribe/unsubscribe/public-key endpoints, and a `utils/push.js` sender hooked into chat send, offer creation, accept and decline. Payloads are fixed constants, delivery is bounded and non-throwing, and everything no-ops without VAPID env vars. The shell was unresponsive during review, so this was verified by reading code (diff via git was unavailable); the coder's evidence was read from p4-verification.md.

Watch for: full backend suite result is unconfirmed by the coder (confirmed, non-blocking; push suite itself 14/14); no VAPID variable documented in any env example (likely, minor).

**Verdict**: APPROVED

## High-level view

Payloads come from a static `PAYLOADS` map keyed by kind (message, offer, update). They hold only a generic title and body plus `data.type` and a relative URL (`/chat`, `/matches`). Nothing from the request, message, user or ride reaches them, so there is no identity or content leak.

Configuration is env-only. Missing VAPID vars make push a silent no-op and `GET /api/push/public-key` returns `null`. No key material appears in any source, env or config file I could search (only the built frontend bundle matched my broad regex, which is unrelated base64-like content). `web-push` is exact-pinned at 3.6.7 in package.json and lock, and neither express-rate-limit nor helmet was added; the existing in-repo limiter is reused.

Delivery never blocks or breaks a response: sends run under `Promise.allSettled` with a 5s per-send timeout and a 6s overall race. Dead endpoints (404/410) are deleted, and other failures are counted and pruned at 5. Chat pushes are throttled per recipient (30s) with an atomic claim that is only spent when the recipient has a subscription.

<details>
<summary>Issues (3)</summary>

1. **Full-suite result unconfirmed** — the coder could not obtain a full `npm test` result for B2 (confirmed); make sure the final gate records a green full run.
2. **VAPID env vars undocumented** — no env example lists VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (likely); add them as empty placeholders to deployment docs.
3. **Overall timeout does not cancel sends** — after the 6s race, in-flight sends continue and may be frozen by serverless (possible, low impact); acceptable, no action required unless pushes are observed dropping.

</details>

<details>
<summary>Details</summary>

## Awaited push in request path

Chat send, createMatch, accept and decline `await` the push call. Worst case adds about 6s of latency to those responses when a push service hangs, because the race resolves at the timeout but sends are not aborted. This is the stated trade-off for serverless and is bounded; it cannot fail the response since `notifyUser` and `notifyMessage` catch everything.

## Subscription ownership and cap

Endpoints must be https and at most 512 chars, keys are length-bounded, and a unique index on endpoint backs the upsert. Resubscribing an endpoint from another account reassigns it, and unsubscribe is scoped by user, so one user cannot delete another's subscription. The 5-per-user cap evicts the oldest. The count-then-delete is not atomic, so concurrent subscribes could briefly exceed 5 (possible, harmless). An `expiresAt` TTL index of 90 days refreshes on resubscribe.

## Not tested

Tests mock `web-push`, so real VAPID signing and a real push service are unverified. Per-send timeout behavior and the 6s overall race are not covered by tests.

</details>

<details>
<summary>File map</summary>

- models/PushSubscription.js: unique endpoint, user index, TTL
- utils/push.js: payload map, sender, per-recipient throttle
- controllers/pushController.js, routes/pushRoutes.js: public-key, subscribe, unsubscribe (auth plus rate limit)
- controllers/chatController.js, matchController.js: awaited push triggers
- models/Conversation.js: lastPushAt.driver/passenger
- tests/push.test.js: 14 tests
- package.json, package-lock.json: web-push 3.6.7 exact

</details>
