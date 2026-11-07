import test from 'node:test';
import assert from 'node:assert/strict';
import { targetWeight } from '../web/seventies.js';

// The target 0.5 A from the point in the sheet; a flank atom directly over the point, 5 A up.
const atoms = [[0, 0, 0], [0.5, 0, 5]];
const isTarget = [true, false];

test('a sheet line under a flank atom keeps the full target weight', () => {
  assert.equal(targetWeight(0.5, 0, 0, atoms, isTarget), 1);
});

test('a sheet line level with the flank atom takes the flank weight', () => {
  assert.equal(targetWeight(0.5, 0, 5, atoms, isTarget), 0);
});

test('a line halfway between the two blends evenly', () => {
  assert.ok(Math.abs(targetWeight(0, 0, 2.5, [[0, 0, 0], [0, 0, 5]], isTarget) - 0.5) < 1e-9);
});
