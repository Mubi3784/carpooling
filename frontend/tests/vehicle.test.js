import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVehicleType, getMaxSeats, getVehicleLabel } from '../src/utils/vehicle.js';

test('normalizeVehicleType treats missing or unknown values as CAR', () => {
  for (const v of [undefined, null, 'car', 'TRUCK']) {
    assert.equal(normalizeVehicleType(v), 'CAR');
  }
  assert.equal(normalizeVehicleType('BIKE'), 'BIKE');
});

test('getMaxSeats caps bikes at 1 and uses car capacity', () => {
  assert.equal(getMaxSeats({ vehicleType: 'BIKE', totalSeats: 4 }), 1);
  assert.equal(getMaxSeats({ vehicleType: 'CAR', totalSeats: 2 }), 2);
  assert.equal(getMaxSeats({}), 6);
});

test('getVehicleLabel returns visible text', () => {
  assert.equal(getVehicleLabel('BIKE'), 'Bike');
  assert.equal(getVehicleLabel(undefined), 'Car');
});
