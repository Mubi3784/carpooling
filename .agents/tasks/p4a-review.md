# Seat reservation moved ahead of the accept claim, with a single-guard seat credit

Accepting a match now reserves seats atomically first, then claims PENDING to ACCEPTED, and only afterwards flips the linked request to MATCHED. Seat credits all go through one atomic `seatsReserved` true-to-false flip, so concurrent or repeated cancels credit once. This removes the old window where a match showed ACCEPTED with no seats behind it.

Watch for: (1) a cancel landing between the claim and the request update leaves the linked request stuck MATCHED against a CANCELLED match (likely, non-blocking); (2) manual `updateSeats` in `rideController` still does a non-atomic read-modify-save of `availableSeats` (possible, out of the plan's A4 scope).

**Verdict**: APPROVED

## High-level view

The accept path is reserve, claim, then request update. If the claim loses, the seats go back through the capped `restoreSeats`. A failed reserve returns 409 and leaves the match PENDING, so ACCEPTED never exists without held seats.

`seatsReserved` on `RideMatch` is the only record of held seats. `releaseSeatsForMatch` is the only credit path, and it credits only when it wins the atomic flip. `cancelMatchInternal` and `reconcileSeats` both use it. `restoreSeats` caps at `totalSeats`, and `reserveSeats` requires `availableSeats >= n`, so seats stay within 0..totalSeats.

The request-MATCHED step is last and has a rollback that only credits if it wins the flip back to PENDING. One interleaving is not covered: a cancel that lands before the request update succeeds. Nine new tests cover the required scenarios. The coder's evidence shows 101/101 backend tests passing.

<details>
<summary>Issues (3)</summary>

1. **Request stuck MATCHED after cancel race** (likely, non-blocking) — if the match is cancelled between `claimMatch` and the `RideRequest.updateOne` in `acceptMatch`, `cancelMatchInternal` finds the request still ACTIVE and skips the reset. The accept path then marks it MATCHED with `matchedRide` pointing at a cancelled match. After the update, re-check the match is still ACCEPTED and revert the request if not. Alternatively, have `reconcileSeats` also repair MATCHED requests with no live match.
2. **Manual updateSeats non-atomic** (possible, non-blocking) — `rideController` ~L516 assigns `ride.availableSeats = seats` and saves, which can overwrite a concurrent reserve/restore. The plan (A4) left this out of scope, so this is only a follow-up. Check that it clamps to 0..totalSeats and consider an atomic update.
3. **Backfill script (A6) and cron wiring not done** (informational, tracked) — the coder says so in the verification file. Legacy ACCEPTED matches without `seatsReserved` will not credit seats on cancel until the backfill runs. It must land before deploy.

</details>

<details>
<summary>Details</summary>

## Cancel racing the request-MATCHED step

After `claimMatch` succeeds, the match is ACCEPTED with seats held. Suppose the other party cancels now. `cancelMatchInternal` flips the match to CANCELLED and releases the seats correctly. Its reset of the request only matches `status: 'MATCHED'`, and the request is still ACTIVE at that point. The accept handler then runs `RideRequest.updateOne({status:'ACTIVE'})`, which succeeds, so `matchedCount` is 1 and no rollback happens. The request ends up MATCHED with a cancelled match until it expires. Seats stay correct, so the user's seat invariants hold. The cost is that the passenger's request is unusable. The window is narrow, which is why this is non-blocking.

## Evidence

I read `matchService.js`, `RideMatch.js` and `acceptMatch` directly and confirmed they match the plan (A1–A3). I did not re-run the suite, as instructed. `p4-verification.md` section A records `npm.cmd test` with 101/101 passing across 3 suites, 92 existing plus 9 new. The nine test names in `tests/seat-race.test.js` cover every scenario A5 listed: concurrent accept vs cancel in a loop, double cancel sequential and concurrent, failed reserve never ACCEPTED, last-seat race, claim null and claim throw, request-failure compensation, and idempotent reconcile.

</details>

<details>
<summary>File map</summary>

- `backend/models/RideMatch.js` — `seatsReserved` field and reconcile index
- `backend/utils/matchService.js` — `claimMatch`, `releaseSeatsForMatch`, `reconcileSeats`, and cancel routed through release
- `backend/controllers/matchController.js` — `acceptMatch` reordered to reserve, claim, request MATCHED, with rollback
- `backend/tests/seat-race.test.js` — nine seat-race tests

Full diff: `git diff main` (these files are untracked in the working tree).

</details>
