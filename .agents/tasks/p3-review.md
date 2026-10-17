# P3 review: requests, matches, atomic seat logic

Reviewed the local diff (matchService, matchController, RideMatch model, routes, matching, activeItemCount) and the evidence in p3-verification.md. I did not re-run any suite, as instructed.

**Verdict**: APPROVED

Watch for: the accept path is claim-match, reserve-seats, mark-request in three separate writes with compensating rollbacks (likely, non-blocking), and the frontend was never rendered (confirmed in the verification note).

## High-level view
Seat safety rests on `reserveSeats`, a single conditional `findOneAndUpdate` (status ACTIVE, `availableSeats >= n`, not expired) with a pipeline update that decrements and sets FULL in the same operation. Oversell is impossible regardless of interleaving. `restoreSeats` is also a single atomic op, capped at totalSeats, flipping FULL to ACTIVE. The verification note lists a concurrent last-seat accept test (one 200, one 409, seats 0, FULL, loser stays PENDING), which I take as evidence.

The state machine is enforced by status-guarded atomic updates on every transition. A partial unique index on (ride, passenger) for PENDING/ACCEPTED blocks duplicates (409 on E11000). Decline is blocked from resend by an explicit DECLINED check. Responder-only accept/decline gives 403 to the initiator, and outsiders get 404. Viewing never changes status. Ride and series delete cascade through `cancelMatchInternal` without seat restore and reopen linked requests.

Privacy is handled by `buildMatchView`, a field-by-field whitelist with first-name-only counterparts and no ids of users, email or phone. Expiry is derived at read time (`expiresAt <= now` gives EXPIRED, list filters on `expiresAt > now`), with TTL as cleanup only. The cap uses `countActiveFutureItems` (rides ACTIVE/FULL plus requests ACTIVE/MATCHED, unexpired). Route order puts static paths (`/mine`, `/series/:seriesId`, `/alerts/count`) before `/:id`.

<details>
<summary>Issues (4)</summary>

1. **Non-atomic accept sequence** (non-blocking, likely) — claim, reserve and request-mark are separate writes; a process crash between them leaves ACCEPTED without seats or a stuck request. Consider a transaction or a reconciliation step later.
2. **Transient ACCEPTED on failed reserve** (non-blocking, confirmed) — between the claim and `revert()` the match is briefly ACCEPTED and visible/cancellable; a cancel in that window would call restoreSeats for seats never taken (capped at totalSeats, but could over-credit another accepted booking). Narrow window; reserve seats first or guard cancel.
3. **Cap race** (non-blocking, confirmed, acknowledged) — count-then-insert is best effort under parallel creation; not tested.
4. **Unverified UI and stray file** (non-blocking) — no browser verification of new pages; untracked `backend/t.log` should be deleted or ignored before commit.

</details>

<details>
<summary>Details</summary>

## Accept ordering and compensating writes
`acceptMatch` first claims the match (PENDING to ACCEPTED), then reserves seats, then marks the request MATCHED. Failure of either later step reverts through compensating updates. Seat integrity holds because only `reserveSeats` decrements. The weakness is the visible intermediate ACCEPTED state: a concurrent `cancelMatch` by the other party in that window passes the ACCEPTED check and `restoreSeats` adds seats that were never reserved. The cap at totalSeats limits damage to over-crediting free seats when other bookings exist. Reordering to reserve first, then claim (releasing seats if the claim fails) removes the window.

## Cancel and cascade
`cancelMatchInternal` is guarded by a status filter so double cancel restores once. Ride deletion passes `restore: false` and reopens linked requests only if they are MATCHED to that ride. Chat purge is a P4 hook.

## Privacy and 404 posture
Populates select only name and display fields, and the view maps them explicitly. Non-participants and malformed ids get 404.

</details>

<details>
<summary>File map</summary>

Backend: matchService.js (atomic seats, cascade), matchController.js, requestController.js, RideMatch/RideRequest models, matching.js (eligibility), activeItemCount.js (shared cap), routes, rideController (cap, cascade), tests/requests-matches.test.js. Frontend: new request/match pages, Navbar badge, api.js. Full diff: `git diff` plus untracked files.

</details>
