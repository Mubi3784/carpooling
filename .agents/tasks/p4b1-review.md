# Chat core, strict contact masking, reports and daily cron (backend B1)

Adds ACCEPTED-only chat (`/api/chat`), a participant-gated access helper with read-time expiry, report snapshots in `reported_flags`, admin read APIs, `GET/PATCH /api/auth/profile`, a Bearer-secret cron sweep, and removes email, phone and WhatsApp from every ride, match, request, chat and auth response. Chat creation is wired into accept through `chatHooks.createChatForMatch`. The coder's B1 verification shows 4 suites and 123 tests passing, and the test names cover each decision. I did not re-run the suite. I read the code paths against the decisions.

Watch for: non-atomic message cap and rate limit (possible, minor); bulk read-marking can mark messages beyond the returned page as read (confirmed, minor); plan items `RateCounter`, `userRateLimit` and `privacy.test.js` were replaced by equivalents (informational).

**Verdict**: APPROVED

## High-level view

Privacy masking is done field by field rather than by stripping keys. `/auth` returns `{id,name,role}`, populates select `name` only, and the stored ride `whatsappNumber` is excluded from every read path and never present in create, update-seats or series responses. Contact details exist only on `GET/PATCH /api/auth/profile`, scoped to the caller.

Every chat route goes through one gate, `loadConversationForUser`. It returns an identical 404 for malformed ids, unknown ids and non-participants. It hard-deletes and returns 410 when `expiresAt` has passed, the ride is gone or cancelled, or the match is no longer ACCEPTED. Expiry does not depend on the Mongo TTL monitor. The report route reuses the gate and maps non-participants to a "message not found" 404.

Sending is idempotent on `clientMessageId`, sanitizes control characters while keeping `<`/`>` literal (plain-text stance documented), and enforces 500 characters, a 300-message cap and 20 messages per minute per user. The per-user limit is computed from stored Message documents, so it works across serverless instances without a counter collection. The remaining gaps are race windows, listed below.

Reports store a self-contained snapshot with a 15-day `expiresAt` TTL. They are unique per reporter and message, reject own-message reports, and are limited to 10 per hour. The cron uses a sha256-then-`timingSafeEqual` Bearer check and fails closed with 401 when `CRON_SECRET` is unset. Its sweep is batch-bounded and idempotent, and `vercel.json` declares the daily schedule.

<details>
<summary>Issues (4)</summary>

1. **Non-atomic cap and rate limit** (possible) — `sendMessage` counts messages and then inserts, so concurrent sends from one user can exceed 20/min or 300/chat by a few. Acceptable for V1; use a `$inc` counter on the Conversation if it matters.
2. **Over-eager read marking** (confirmed, minor) — `getMessages` runs `updateMany` for all of the other party's unread messages, not just the returned page of up to 100. With the 300 cap, a first load can mark older messages read without delivering them. Restrict the update to the returned ids, or accept it.
3. **Unread counter drift** (possible, minor) — the message insert and the Conversation `$inc` and `lastMessageAt` update are two writes. A crash between them leaves a message without an unread bump. It self-heals on the next read.
4. **Plan deviation to record** (informational) — there is no `RateCounter`, `userRateLimit` or standalone `privacy.test.js`. The masking tests live in `chat.test.js`. This meets the intent; note it for B2, which was planned to reuse `RateCounter` for push rate limits.

</details>

<details>
<summary>Details</summary>

## Message limits are query-based, not atomic

The per-minute limit counts the sender's recent Message documents, and the cap counts the conversation's messages, both before insert. Two concurrent requests can both pass. The effect is bounded and low. The idempotency replay check runs first, so retries do not consume the limit. The Mongo unique index on `{conversation, clientMessageId}` backs idempotency under races. It also means an id collision from the other participant returns 409 rather than leaking the message.

## Read marking scope in getMessages

On the first load the page is the newest 100 messages. The follow-up `updateMany` marks every message from the other party with `readAt` null, and zeroes the unread counter. When a chat holds more than 100 unread incoming messages, the older ones are marked read without being returned. Reaching that state needs the full 300 cap, so it is an edge case.

## Cron sweep

The sweep releases stuck seats via `reconcileSeats` before rides are deleted. It then purges expired and orphaned conversations, deletes stray expired messages, deletes expired rides together with their matches and chats, and deletes requests past `purgeAt`, reports past their expiry, and push subscriptions when that model exists. The orphan scan is capped at 20 batches of 500 per run. The next daily run continues it.

</details>

<details>
<summary>File map</summary>

Full diff: `git diff main` in the repo, plus the untracked new files below.

- `controllers/chatController.js`, `routes/chatRoutes.js`: chat endpoints, validation, idempotency, limits, reports
- `utils/chatAccess.js`: participant gate, 404/410 and hard-delete
- `utils/chatHooks.js`: idempotent create, purge helpers
- `models/Conversation.js`, `Message.js`, `ReportedFlag.js`: schemas, unique and TTL indexes
- `controllers/adminController.js`, `routes/adminRoutes.js`: admin-only reports, conversations and messages
- `controllers/cronController.js`, `routes/cronRoutes.js`, `vercel.json`: Bearer-secret cleanup and daily schedule
- `controllers/authController.js`, `routes/authRoutes.js`: `{id,name,role}` responses, profile GET/PATCH
- `controllers/rideController.js`, `models/Ride.js`: `whatsappNumber` optional and never returned
- `server.js`: route mounts, generic 5xx errors
- `tests/chat.test.js`, `tests/api.test.js`: new coverage, masking assertions flipped

</details>
