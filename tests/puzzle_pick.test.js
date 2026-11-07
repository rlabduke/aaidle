import test from 'node:test';
import assert from 'node:assert/strict';
import { weightedIndex, pickRotamer, pickAminoAcid } from '../web/puzzle_pick.js';
import { mulberry32 } from '../web/daily_schedule.js';

const sweep = n => Array.from({ length: n }, (_, i) => (i + 0.5) / n);

test('weightedIndex splits [0, 1) by cumulative weight', () => {
  assert.equal(weightedIndex([1, 3], 0), 0);
  assert.equal(weightedIndex([1, 3], 0.24), 0);
  assert.equal(weightedIndex([1, 3], 0.25), 1);
  assert.equal(weightedIndex([1, 3], 0.999), 1);
});

test('weightedIndex draws in proportion to the weights', () => {
  const weights = [9.9, 6.14, 6.13];
  const sum = weights.reduce((a, b) => a + b, 0);
  const counts = [0, 0, 0];
  for (const r of sweep(1000)) counts[weightedIndex(weights, r)]++;
  weights.forEach((w, i) => assert.ok(Math.abs(counts[i] - (1000 * w) / sum) <= 1, `index ${i}: ${counts[i]}`));
});

test('weightedIndex ignores bad weights and falls back to uniform when all are zero', () => {
  assert.equal(weightedIndex([0, 0], 0.7), 1);
  assert.equal(weightedIndex([NaN, 2], 0.1), 1);
  assert.equal(weightedIndex([-5, 2], 0.1), 1);
});

test('pickRotamer weights by frequency', () => {
  const puzzles = [{ id: 'a', frequency: 99 }, { id: 'b', frequency: 1 }];
  assert.equal(pickRotamer(puzzles, 0.5).id, 'a');
  assert.equal(pickRotamer(puzzles, 0.995).id, 'b');
});

test('pickRotamer treats a manifest without frequency as equal weights', () => {
  assert.equal(pickRotamer([{ id: 'a' }, { id: 'b' }], 0.6).id, 'b');
  assert.equal(pickRotamer([{ id: 'a' }, { id: 'b' }], 0.4).id, 'a');
});

test('pickRotamer returns the only puzzle of a single-rotamer amino acid', () => {
  for (const r of [0, 0.5, 0.999]) assert.equal(pickRotamer([{ id: 'gly', frequency: 100 }], r).id, 'gly');
});

test('pickAminoAcid never repeats the previous amino acid when another exists', () => {
  for (const r of sweep(50)) assert.equal(pickAminoAcid(['ARG', 'GLY'], 'ARG', r), 'GLY');
});

test('pickAminoAcid returns the previous amino acid when it is the only one', () => {
  assert.equal(pickAminoAcid(['ARG'], 'ARG', 0.5), 'ARG');
});

test('pickAminoAcid is uniform over the others', () => {
  const codes = Array.from({ length: 20 }, (_, i) => `AA${i}`);
  const counts = {};
  for (const r of sweep(2000)) {
    const aa = pickAminoAcid(codes, 'AA0', r);
    counts[aa] = (counts[aa] || 0) + 1;
  }
  assert.equal(counts.AA0, undefined);
  for (const code of codes.slice(1)) assert.ok(counts[code] === 105 || counts[code] === 106, `${code}: ${counts[code]}`);
});

test('the same daily seed picks the same rotamer', () => {
  const puzzles = [{ id: 'x', frequency: 9.9 }, { id: 'y', frequency: 6.1 }, { id: 'z', frequency: 2.7 }];
  assert.equal(pickRotamer(puzzles, mulberry32(20261106)()).id, pickRotamer(puzzles, mulberry32(20261106)()).id);
});
