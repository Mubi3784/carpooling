import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_LEVEL_LABELS,
  SAFETY_NOTE,
  groupByLevel,
  levelOrder,
  emptyMessage,
  buildFeedParams,
  countActiveFilters,
  joinPayloadFor,
} from '../src/utils/matches.js';

test('labels, order, empty message and safety note', () => {
  assert.equal(MATCH_LEVEL_LABELS.EXACT, 'Exact match');
  assert.equal(MATCH_LEVEL_LABELS.CLOSE, 'Close match');
  assert.equal(MATCH_LEVEL_LABELS.ALTERNATIVE, 'Alternative');
  assert.ok(levelOrder('EXACT') < levelOrder('CLOSE'));
  assert.ok(levelOrder('CLOSE') < levelOrder('ALTERNATIVE'));
  assert.ok(levelOrder('???') > levelOrder('ALTERNATIVE'));
  assert.match(emptyMessage(), /No exact matches yet — try nearby times or the other vehicle type/);
  assert.match(SAFETY_NOTE, /do not guarantee a seat/);
});

test('groupByLevel orders groups, skips empty ones and counts', () => {
  const items = [
    { id: 1, matchLevel: 'ALTERNATIVE' },
    { id: 2, matchLevel: 'EXACT' },
    { id: 3, matchLevel: 'ALTERNATIVE' },
  ];
  const { groups, counts } = groupByLevel(items);
  assert.deepEqual(groups.map((g) => g.level), ['EXACT', 'ALTERNATIVE']);
  assert.deepEqual(groups[1].items.map((i) => i.id), [1, 3]);
  assert.deepEqual(counts, { EXACT: 1, CLOSE: 0, ALTERNATIVE: 2 });
  assert.deepEqual(groupByLevel(undefined).groups, []);
});

test('buildFeedParams drops empties and validates', () => {
  assert.deepEqual(buildFeedParams({}), { params: {} });
  assert.deepEqual(
    buildFeedParams({ timeFrom: '07:00', timeTo: '09:30', pickup: ' Gulshan ', destination: '', minSeats: '2' }),
    { params: { timeFrom: '07:00', timeTo: '09:30', pickup: 'Gulshan', minSeats: '2' } }
  );
  assert.ok(buildFeedParams({ timeFrom: '10:00', timeTo: '09:00' }).error);
  assert.ok(buildFeedParams({ timeFrom: '25:00' }).error);
  assert.ok(buildFeedParams({ minSeats: '0' }).error);
  assert.ok(buildFeedParams({ minSeats: '7' }).error);
  assert.equal(buildFeedParams({ pickup: 'a'.repeat(80) }).params.pickup.length, 50);
});

test('countActiveFilters counts only filled filters', () => {
  assert.equal(countActiveFilters({}), 0);
  assert.equal(countActiveFilters({ timeFrom: '', pickup: '  ', minSeats: '' , vehicle: 'ALL' }), 0);
  assert.equal(countActiveFilters({ timeFrom: '07:00', pickup: 'x', vehicle: 'CAR' }), 3);
});

test('joinPayloadFor omits requestId when the vehicle differs', () => {
  const request = { id: 'q1', passengerCount: 2 };
  const linked = joinPayloadFor({ canLinkRequest: true, ride: { id: 'r1', vehicleType: 'CAR' } }, request, 'cid');
  assert.deepEqual(linked, { rideId: 'r1', requestId: 'q1', clientMatchId: 'cid' });
  const unlinked = joinPayloadFor({ canLinkRequest: false, ride: { id: 'r2', vehicleType: 'CAR' } }, request, 'cid');
  assert.deepEqual(unlinked, { rideId: 'r2', passengerCount: 2, clientMatchId: 'cid' });
  const bike = joinPayloadFor({ canLinkRequest: false, ride: { id: 'r3', vehicleType: 'BIKE' } }, request, 'cid');
  assert.equal(bike.passengerCount, 1);
  assert.equal('requestId' in bike, false);
});
