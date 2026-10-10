import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRideImpact,
  estimateCorridorDistance,
  MIN_SOLO_FARE,
} from '../src/utils/impactCalculator.js';

test('Saddar -> Blue Area uses the 18 km corridor', () => {
  const impact = calculateRideImpact('Saddar, Rawalpindi', 'Blue Area, Islamabad', 200);
  assert.equal(impact.distanceKm, 18);
  assert.equal(impact.soloEstimate, 1170);
  assert.equal(impact.passengerSavings, 970);
  assert.equal(impact.co2KgSaved, 3.1);
  assert.equal(impact.isIntercity, false);
});

test('corridors match in either direction', () => {
  const impact = calculateRideImpact('Blue Area', 'Saddar', 200);
  assert.equal(impact.distanceKm, 18);
  assert.equal(impact.soloEstimate, 1170);
});

test('Rawalpindi -> NUST H12 tolerates sector spelling and uses 22 km', () => {
  assert.equal(estimateCorridorDistance('Rawalpindi', 'NUST H12').distanceKm, 22);
  assert.equal(estimateCorridorDistance('NUST h 12', 'Commercial Market').distanceKm, 22);
});

test('F-10 -> FAST University uses the 14 km corridor', () => {
  assert.equal(estimateCorridorDistance('F-10', 'FAST University').distanceKm, 14);
});

test('Faizabad -> COMSATS Park Road uses the 12 km corridor', () => {
  const impact = calculateRideImpact('Faizabad', 'COMSATS Park Road', 150);
  assert.equal(impact.distanceKm, 12);
  assert.equal(impact.soloEstimate, 780);
  assert.equal(impact.passengerSavings, 630);
});

test('unknown Twin Cities pair falls back to 15 km', () => {
  const impact = calculateRideImpact('G-11 Markaz', 'E-11', 100);
  assert.equal(impact.distanceKm, 15);
  assert.equal(impact.soloEstimate, 975);
  assert.equal(impact.corridorLabel, 'Twin Cities default');
});

test('intercity / motorway routes use 120 km and flag isIntercity', () => {
  const impact = calculateRideImpact('Islamabad', 'Peshawar', 1500);
  assert.equal(impact.distanceKm, 120);
  assert.equal(impact.isIntercity, true);
  assert.equal(impact.soloEstimate, 7800);
  assert.equal(estimateCorridorDistance('Islamabad', 'Lahore via M2').isIntercity, true);
});

test('solo estimate never drops below the minimum fare and savings clamp at 0', () => {
  const impact = calculateRideImpact('Saddar', 'Blue Area', 5000);
  assert.ok(impact.soloEstimate >= MIN_SOLO_FARE);
  assert.equal(impact.passengerSavings, 0);
});

test('CO2 scales with the number of seats', () => {
  const impact = calculateRideImpact('Saddar', 'Blue Area', 200, 3);
  assert.equal(impact.co2KgSaved, 9.2);
});

test('missing or invalid inputs do not throw', () => {
  const impact = calculateRideImpact(null, undefined, 'abc', 'xyz');
  assert.equal(impact.distanceKm, 15);
  assert.equal(impact.passengerSavings, 975);
  assert.equal(impact.co2KgSaved, 2.6);
});
